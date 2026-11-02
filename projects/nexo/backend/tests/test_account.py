from email.message import Message
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.account import (
    AccountStore,
    AccountUser,
    CompletedWork,
    LibraryUpdate,
    OnboardingUpdate,
    TasteChoice,
)
from app.api.account import create_account_router
from app.catalog import Catalog
from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def store() -> AccountStore:
    settings = Settings(
        _env_file=None,
        catalog_source="local",
        supabase_url="https://test.supabase.co",
        supabase_publishable_key="sb_publishable_test",
    )
    return AccountStore(settings, Catalog(settings))


def client_for(store: AccountStore) -> TestClient:
    app = FastAPI()
    app.include_router(create_account_router(store))
    return TestClient(app)


def test_private_endpoints_require_bearer_authentication(store: AccountStore) -> None:
    client = client_for(store)
    with patch.object(store, "user") as verify:
        assert client.get("/api/v1/me").status_code == 401
        assert client.get("/api/v1/me/library").status_code == 401
        assert client.post("/api/v1/me/library/completed", json={"item": {}}).status_code == 401
        assert client.delete("/api/v1/me/library/interstellar").status_code == 401
        verify.assert_not_called()


@pytest.mark.parametrize("reaction", ["liked", "disliked", None])
def test_completion_is_atomic_and_does_not_invent_a_rating(
    store: AccountStore, reaction: str | None
) -> None:
    user = AccountUser(id=uuid4())
    item = store.catalog.items()[0].model_dump(mode="json")
    entry = {
        "media_key": item["slug"],
        "status": "completed",
        "rating": None,
        "is_favorite": False,
        "reaction": reaction,
    }
    with (
        patch.object(store, "ensure_profile"),
        patch.object(
            store, "request", return_value=({"item": item, "entry": entry}, None)
        ) as request,
    ):
        result = store.complete_work(
            user, "owner-token", CompletedWork.model_validate({"item": item, "reaction": reaction})
        )
    assert result.entry.rating is None
    assert result.entry.reaction == reaction
    request.assert_called_once_with(
        "/rest/v1/rpc/record_completed_work",
        "owner-token",
        "POST",
        {"p_item": item, "p_reaction": reaction},
    )


def test_completion_rejects_owner_spoofing_and_invalid_opinions(store: AccountStore) -> None:
    client = client_for(store)
    with (
        patch.object(store, "user", return_value=AccountUser(id=uuid4())),
        patch.object(store, "complete_work") as complete,
    ):
        for invalid in ({"reaction": "bad"}, {"user_id": str(uuid4())}, {"rating": 5}):
            response = client.post(
                "/api/v1/me/library/completed",
                headers={"Authorization": "Bearer owner"},
                json={"item": {}, **invalid},
            )
            assert response.status_code == 422
        complete.assert_not_called()


def test_user_identity_is_verified_with_supabase_not_decoded_from_client_claims(
    store: AccountStore,
) -> None:
    user_id = uuid4()
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = (
        ' {"id":"'
        + str(user_id)
        + '","email":"owner@example.invalid","user_metadata":{"admin":true}}'
    ).encode()
    with patch("app.account.urlopen", return_value=response) as request:
        assert store.user("untrusted-bearer").id == user_id
    sent = request.call_args.args[0]
    assert sent.full_url.endswith("/auth/v1/user")
    assert sent.get_header("Authorization") == "Bearer untrusted-bearer"
    assert sent.get_header("Apikey") == "sb_publishable_test"


def test_expired_or_invalid_tokens_are_rejected_without_leaking_errors(store: AccountStore) -> None:
    error = HTTPError(
        "https://test.supabase.co/auth/v1/user", 401, "private upstream details", Message(), None
    )
    with patch("app.account.urlopen", side_effect=error), pytest.raises(HTTPException) as result:
        store.user("bad-token")
    assert result.value.status_code == 401
    assert "private upstream" not in str(result.value.detail)


def test_save_uses_verified_owner_and_scoped_user_token(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    item = store.catalog.items()[0]
    with patch.object(store, "request", return_value=(None, None)) as request:
        saved = store.save(
            user, "user-token", item.slug, {**item.model_dump(mode="json"), "user_id": str(uuid4())}
        )
    call = request.call_args
    assert call.args[1] == "user-token"
    assert call.args[3]["user_id"] == str(user.id)
    assert "user_id" not in call.args[3]["media_snapshot"]
    assert saved.id == item.id


def test_route_rejects_owner_in_body_and_invalid_profile_fields(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    client = client_for(store)
    headers = {"Authorization": "Bearer test"}
    with patch.object(store, "user", return_value=user), patch.object(store, "save") as save:
        response = client.put(
            "/api/v1/me/library/interstellar",
            headers=headers,
            json={"item": {}, "user_id": str(uuid4())},
        )
        assert response.status_code == 422
        save.assert_not_called()
        assert (
            client.patch(
                "/api/v1/me",
                headers=headers,
                json={"id": str(uuid4()), "display_name": "Other owner"},
            ).status_code
            == 422
        )
        assert (
            client.patch("/api/v1/me", headers=headers, json={"display_name": "  "}).status_code
            == 422
        )
        assert (
            client.post(
                "/api/v1/me/library/import", headers=headers, json={"items": [{}] * 101}
            ).status_code
            == 422
        )


def test_save_validates_media_and_preserves_slug_identity(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    item = store.catalog.items()[0].model_dump(mode="json")
    with pytest.raises(HTTPException) as mismatch:
        store.save(user, "token", "wrong-key", item)
    assert mismatch.value.status_code == 422
    with pytest.raises(HTTPException):
        store.validate_item({**item, "source_url": "javascript:alert(1)"})


def test_import_batches_canonical_lookup_and_is_non_destructive(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    rows = [item.model_dump(mode="json") for item in store.catalog.items()]
    with (
        patch.object(store.catalog, "canonical_items", return_value=[]) as resolve,
        patch.object(store, "request", return_value=(None, None)) as request,
    ):
        assert store.import_items(user, "owner-token", [*rows, *rows]) == 8
    assert resolve.call_count == 1
    call = request.call_args
    assert len(call.args[3]) == 8
    assert all(row["user_id"] == str(user.id) for row in call.args[3])
    assert "resolution=ignore-duplicates" in call.args[4]


def test_library_only_queries_verified_owner(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    snapshot = store.catalog.items()[0].model_dump(mode="json")
    with patch.object(
        store,
        "request",
        side_effect=[
            (None, None),
            (
                [
                    {
                        "media_snapshot": snapshot,
                        "media_key": snapshot["slug"],
                        "status": "planned",
                        "rating": None,
                        "is_favorite": False,
                    }
                ],
                "0-0/1",
            ),
        ],
    ) as request:
        result = store.library(user, "owner-token", 100, 0)
    assert result.total == 1
    assert str(user.id) in request.call_args.args[0]
    assert request.call_args.args[1] == "owner-token"
    assert result.entries[0].status == "planned"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"rating": 0},
        {"rating": 6},
        {"rating": 2.5},
        {"rating": True},
        {"status": "unknown"},
        {"status": None},
        {"is_favorite": None},
        {"is_favorite": "true"},
        {"user_id": str(uuid4())},
    ],
)
def test_feedback_rejects_invalid_or_unowned_fields(
    store: AccountStore, body: dict[str, object]
) -> None:
    with (
        patch.object(store, "user", return_value=AccountUser(id=uuid4())),
        patch.object(store, "update_library") as update,
    ):
        response = client_for(store).patch(
            "/api/v1/me/library/interstellar", headers={"Authorization": "Bearer token"}, json=body
        )
    assert response.status_code == 422
    update.assert_not_called()


def test_feedback_patch_preserves_omitted_fields_and_can_clear_rating(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    row = {"media_key": "interstellar", "status": "completed", "rating": None, "is_favorite": True}
    with patch.object(store, "request", return_value=([row], None)) as request:
        result = store.update_library(
            user, "scoped-token", "interstellar", LibraryUpdate(rating=None)
        )
    assert request.call_args.args[2:4] == ("PATCH", {"rating": None})
    assert str(user.id) in request.call_args.args[0]
    assert request.call_args.args[1] == "scoped-token"
    assert result.status == "completed" and result.is_favorite


def test_feedback_missing_title_is_not_inserted(store: AccountStore) -> None:
    with (
        patch.object(store, "request", return_value=([], None)) as request,
        pytest.raises(HTTPException) as result,
    ):
        store.update_library(
            AccountUser(id=uuid4()), "token", "absent", LibraryUpdate(status="completed")
        )
    assert result.value.status_code == 404
    assert request.call_count == 1


def test_mutation_cors_allows_authorization_for_configured_frontend() -> None:
    client = TestClient(create_app(Settings(_env_file=None, catalog_source="local")))
    response = client.options(
        "/api/v1/me/library/interstellar",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_onboarding_endpoints_require_authentication(store: AccountStore) -> None:
    client = client_for(store)
    assert client.post("/api/v1/me/tastes", json={"item": {}, "rating": 5}).status_code == 401
    assert client.put("/api/v1/me/onboarding", json={"action": "skip"}).status_code == 401
    assert client.get("/api/v1/me/preparation").status_code == 401


def test_preparation_route_returns_only_the_verified_users_library(store: AccountStore) -> None:
    from app.account import LibraryFeedback, LibraryPage

    user = AccountUser(id=uuid4())
    item = store.catalog.items()[0]
    entry = LibraryFeedback(media_key=item.slug, status="planned", rating=2, is_favorite=False)
    with (
        patch.object(store, "user", return_value=user),
        patch.object(
            store,
            "library",
            return_value=LibraryPage(items=[item], entries=[entry], total=1, limit=100, offset=0),
        ) as library,
    ):
        response = client_for(store).get(
            "/api/v1/me/preparation", headers={"Authorization": "Bearer owner-token"}
        )
    assert response.status_code == 200
    assert library.call_args.args == (user, "owner-token", 100, 0)
    assert response.json()["signal_count"] == 1
    assert response.json()["signals"][0]["rating"] == 2
    assert "owner-token" not in response.text and str(user.id) not in response.text


@pytest.mark.parametrize(
    "update",
    [
        {},
        {"rating": True},
        {"rating": 2.5},
        {"rating": 0},
        {"rating": 6},
        {"is_favorite": None},
        {"is_favorite": "true"},
        {"status": "completed"},
        {"user_id": str(uuid4())},
    ],
)
def test_taste_body_rejects_invalid_signals(store: AccountStore, update: dict[str, object]) -> None:
    with (
        patch.object(store, "user", return_value=AccountUser(id=uuid4())),
        patch.object(store, "choose_taste") as choose,
    ):
        result = client_for(store).post(
            "/api/v1/me/tastes",
            headers={"Authorization": "Bearer token"},
            json={"item": {}, **update},
        )
    assert result.status_code == 422
    choose.assert_not_called()


def test_taste_save_is_one_upsert_without_inferred_status_or_other_signals(
    store: AccountStore,
) -> None:
    user = AccountUser(id=uuid4())
    item = store.catalog.items()[0]
    row = {
        "media_snapshot": item.model_dump(mode="json"),
        "media_key": item.slug,
        "status": "paused",
        "rating": 4,
        "is_favorite": True,
    }
    with patch.object(store, "request", side_effect=[(None, None), ([row], None)]) as request:
        result = store.choose_taste(
            user, "owner-token", TasteChoice(item=item.model_dump(mode="json"), rating=4)
        )
    sent = request.call_args
    assert sent.args[1] == "owner-token"
    assert sent.args[3]["user_id"] == str(user.id)
    assert sent.args[3]["rating"] == 4
    assert "status" not in sent.args[3] and "is_favorite" not in sent.args[3]
    assert "resolution=merge-duplicates" in sent.args[4]
    assert result.entry.is_favorite and result.entry.status == "paused"


@pytest.mark.parametrize(("action", "status"), [("skip", "skipped"), ("complete", "completed")])
def test_onboarding_state_updates_only_the_verified_profile(
    store: AccountStore, action: str, status: str
) -> None:
    user = AccountUser(id=uuid4())
    row = {
        "id": str(user.id),
        "display_name": None,
        "onboarding_status": status,
        "created_at": "2026-10-31T00:00:00Z",
        "updated_at": "2026-10-31T00:00:00Z",
    }
    with patch.object(store, "request", side_effect=[(None, None), ([row], None)]) as request:
        result = store.onboarding(
            user, "owner-token", OnboardingUpdate.model_validate({"action": action})
        )
    assert result.onboarding_status == status
    assert str(user.id) in request.call_args.args[0]
    assert request.call_args.args[3] == {"onboarding_status": status}
    assert all("user_library" not in call.args[0] for call in request.call_args_list)
