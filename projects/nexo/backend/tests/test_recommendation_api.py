from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.account import AccountStore, AccountUser, LibraryFeedback
from app.api.account import create_account_router
from app.catalog import Catalog, CatalogUnavailable
from app.core.config import Settings
from app.data_quality import prepare_library
from app.evaluate_recommendations import leave_one_out
from app.recommendations import CatalogIndex, RecommendationPage, RecommendationService


def setup() -> tuple[AccountStore, TestClient]:
    settings = Settings(_env_file=None, catalog_source="local")
    store = AccountStore(settings, Catalog(settings))
    app = FastAPI()
    app.include_router(create_account_router(store))
    return store, TestClient(app)


def test_recommendations_require_auth_and_validate_filters() -> None:
    store, client = setup()
    assert client.get("/api/v1/me/recommendations").status_code == 401
    with patch.object(store, "user", return_value=AccountUser(id=uuid4())):
        for query in (
            "limit=0",
            "limit=25",
            "media_type=music",
            "strategy=unknown",
            "offset=-1",
            "offset=5001",
        ):
            assert (
                client.get(
                    "/api/v1/me/recommendations?" + query, headers={"Authorization": "Bearer token"}
                ).status_code
                == 422
            )


def test_personalized_refresh_passes_offset_filter_and_authenticated_owner() -> None:
    settings = Settings(_env_file=None, catalog_source="local")
    store = AccountStore(settings, Catalog(settings))
    personalized = MagicMock()
    personalized.get.return_value = RecommendationPage(status="no_matches", strategy="personalized")
    app = FastAPI()
    app.include_router(create_account_router(store, personalized))
    user = AccountUser(id=uuid4())
    library = prepare_library([], [])
    with (
        TestClient(app) as client,
        patch.object(store, "user", return_value=user),
        patch.object(store, "preparation", return_value=library),
    ):
        response = client.get(
            "/api/v1/me/recommendations?strategy=personalized&media_type=game&offset=12",
            headers={"Authorization": "Bearer token"},
        )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    personalized.get.assert_called_once_with(user, "token", library, 12, "game", 12)
    assert response.json()["has_more"] is False


def test_two_authenticated_people_receive_only_their_own_explanations() -> None:
    store, client = setup()
    first, second = store.catalog.items()[:2]
    a, b = AccountUser(id=uuid4()), AccountUser(id=uuid4())
    libraries = [
        prepare_library(
            [item],
            [LibraryFeedback(media_key=item.slug, status="planned", rating=5, is_favorite=True)],
        )
        for item in (first, second)
    ]
    with (
        patch.object(store, "user", side_effect=[a, b]),
        patch.object(store, "preparation", side_effect=libraries) as load,
    ):
        results = [
            client.get(
                "/api/v1/me/recommendations", headers={"Authorization": f"Bearer private-token-{i}"}
            )
            for i in range(2)
        ]
    for response, own in zip(results, (first, second), strict=True):
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        assert response.json()["status"] == "ready"
        assert all(
            reason["source_slug"] == own.slug
            for row in response.json()["items"]
            for reason in row["reasons"]
        )
        assert "private-token" not in response.text
        assert str(a.id) not in response.text and str(b.id) not in response.text
    assert load.call_args_list[0].args[0] == a and load.call_args_list[1].args[0] == b


def test_catalog_failure_is_safe_and_does_not_fabricate_results() -> None:
    store, client = setup()
    seed = store.catalog.items()[0]
    library = prepare_library(
        [seed],
        [LibraryFeedback(media_key=seed.slug, status="planned", rating=5, is_favorite=False)],
    )
    with (
        patch.object(store, "user", return_value=AccountUser(id=uuid4())),
        patch.object(store, "preparation", return_value=library),
        patch.object(
            RecommendationService, "get_index", side_effect=CatalogUnavailable("sensitive upstream")
        ),
    ):
        response = client.get(
            "/api/v1/me/recommendations", headers={"Authorization": "Bearer token"}
        )
    assert response.status_code == 503 and "sensitive upstream" not in response.text


def test_leave_one_out_removes_the_held_out_preference_and_seen_identity() -> None:
    store, _ = setup()
    items = [item for item in store.catalog.items() if item.slug in {"interstellar", "severance"}]
    library = prepare_library(
        items,
        [
            LibraryFeedback(media_key=item.slug, status="planned", rating=5, is_favorite=True)
            for item in items
        ],
    )
    result = leave_one_out(CatalogIndex(store.catalog.items()), library, "genres", k=8)
    assert result.evaluated == 2
    assert result.hit_rate_at_k == 1
    assert all(rank is not None for rank in result.ranks)
