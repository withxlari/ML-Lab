from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.account import AccountStore, AccountUser
from app.api.community import create_community_router
from app.catalog import Catalog
from app.community import CommunityStore, PublicProfileUpdate, ReviewUpdate
from app.core.config import Settings


@pytest.fixture
def store() -> AccountStore:
    settings = Settings(_env_file=None, catalog_source="local")
    return AccountStore(settings, Catalog(settings))


def test_all_private_community_routes_require_verified_login(store: AccountStore) -> None:
    app = FastAPI()
    app.include_router(create_community_router(store))
    client = TestClient(app)
    for path in [
        "preferences",
        "public-profile",
        "reviews",
        "reviews/test",
        "recommendation-feedback",
        "people",
        "following",
        "following/status/someone",
    ]:
        assert client.get("/api/v1/me/" + path).status_code == 401
    assert client.put("/api/v1/me/following/someone").status_code == 401
    assert client.delete(f"/api/v1/me/following/{uuid4()}").status_code == 401
    with patch.object(store, "user", return_value=AccountUser(id=uuid4())):
        assert (
            client.put(
                "/api/v1/me/preferences",
                headers={"Authorization": "Bearer test"},
                json={"user_id": str(uuid4())},
            ).status_code
            == 422
        )


def test_public_reads_do_not_forward_visitor_tokens_or_select_private_profile_fields(
    store: AccountStore,
) -> None:
    community = CommunityStore(store)
    with patch.object(store, "request", return_value=([], None)) as request:
        with pytest.raises(HTTPException) as error:
            community.public_profile("closed")
    assert error.value.status_code == 404
    assert request.call_args.args[1] is None
    assert "user_id" not in request.call_args.args[0]


def test_top_five_requires_correct_category_and_no_duplicates(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    community = CommunityStore(store)
    item = store.catalog.items()[0].model_dump(mode="json")
    with patch.object(store, "ensure_profile"):
        with pytest.raises(HTTPException):
            community.save_profile(
                user,
                "token",
                PublicProfileUpdate(
                    username="tester", display_name="Tester", top_fives={"movie": [item, item]}
                ),
            )
        with pytest.raises(HTTPException):
            community.save_profile(
                user,
                "token",
                PublicProfileUpdate(
                    username="tester", display_name="Tester", top_fives={"game": [item]}
                ),
            )


def test_written_review_is_saved_with_rating_through_one_atomic_rpc(store: AccountStore) -> None:
    user = AccountUser(id=uuid4())
    community = CommunityStore(store)
    item = store.catalog.items()[0]
    result = {
        "media_key": item.slug,
        "media_snapshot": item.model_dump(mode="json"),
        "body": "Gostei dos personagens.",
        "rating": 4,
        "visibility": "private",
        "spoiler": False,
        "updated_at": "2026-11-01T00:00:00Z",
    }
    with (
        patch.object(store, "ensure_profile"),
        patch.object(store, "request", return_value=(result, None)) as request,
    ):
        saved = community.save_review(
            user,
            "owner-token",
            item.slug,
            ReviewUpdate(item=item.model_dump(mode="json"), body=result["body"], rating=4),
        )
    assert saved.rating == 4
    assert request.call_args.args[0] == "/rest/v1/rpc/save_user_review"
    assert request.call_args.args[1] == "owner-token"
    assert request.call_args.args[3]["p_visibility"] == "private"
