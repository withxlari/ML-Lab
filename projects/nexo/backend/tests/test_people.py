from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.account import AccountStore, AccountUser
from app.api.community import create_community_router
from app.catalog import Catalog, MediaItem
from app.core.config import Settings
from app.people import PeopleStore, Taste, compare_people, public_taste


def items() -> list[MediaItem]:
    return Catalog(Settings(_env_file=None, catalog_source="local")).items()


def test_profile_search_is_public_and_never_forwards_a_visitor_token() -> None:
    config = Settings(_env_file=None, catalog_source="local")
    account = AccountStore(config, Catalog(config))
    app = FastAPI()
    app.include_router(create_community_router(account))
    with patch.object(
        account,
        "request",
        return_value=(
            {
                "items": [
                    {
                        "username": "reader",
                        "display_name": "Leitora",
                        "bio": "",
                        "avatar_path": None,
                    }
                ],
                "total": 1,
            },
            None,
        ),
    ) as request:
        response = TestClient(app).get(
            "/api/v1/people/search",
            params={"q": " @reader "},
            headers={"Authorization": "Bearer visitor"},
        )
    assert response.status_code == 200
    assert response.json()["items"][0]["username"] == "reader"
    assert response.headers["cache-control"] == "no-store"
    request.assert_called_once_with(
        "/rest/v1/rpc/search_public_profiles",
        None,
        "POST",
        {"p_query": "reader", "p_limit": 12, "p_offset": 0},
    )
    with patch.object(account, "request") as request:
        for query in ("a", "@a", "  ", "x" * 81):
            assert (
                TestClient(app).get("/api/v1/people/search", params={"q": query}).status_code == 422
            )
        request.assert_not_called()


def test_shared_likes_are_explained_and_conflicting_ratings_reduce_affinity() -> None:
    a, b = items()[:2]
    left, right = Taste(), Taste()
    for taste in (left, right):
        taste.add(a, 1)
        taste.add(b, 1)
    score, shared, _ = compare_people(left, right)
    assert {i.slug for i in shared} == {a.slug, b.slug}
    right.add(b, -1)
    penalized, _, _ = compare_people(left, right)
    assert penalized < score
    right.add(b, 1.5)
    assert right.works[next(k for k, v in right.works.items() if v[0].slug == b.slug)][1] < 0


def test_generic_genres_alone_do_not_make_people_compatible() -> None:
    a, b = items()[:2]
    left, right = Taste(), Taste()
    left.add(a.model_copy(update={"genres": ["Drama", "Comédia"]}), 1)
    right.add(b.model_copy(update={"genres": ["Drama", "Comédia"]}), 1)
    assert compare_people(left, right)[0] == 0


def test_public_top_five_is_positive_but_low_public_rating_wins() -> None:
    item = items()[0].model_dump(mode="json")
    taste = public_taste({"signals": [{"item": item, "rating": 1}], "top_fives": {"movie": [item]}})
    assert not taste.positives()


def test_follow_is_scoped_to_verified_owner_and_self_follow_is_rejected() -> None:
    config = Settings(_env_file=None, catalog_source="local")
    account = AccountStore(config, Catalog(config))
    people = PeopleStore(account)
    user = AccountUser(id=uuid4())
    target = uuid4()
    with (
        patch.object(people, "target", return_value={"user_id": str(target)}),
        patch.object(account, "ensure_profile"),
        patch.object(account, "request", return_value=(None, None)) as request,
    ):
        assert people.follow(user, "owner-token", "someone").following
        assert request.call_args.args[3] == {
            "follower_id": str(user.id),
            "followed_id": str(target),
        }
        assert request.call_args.args[1] == "owner-token"
    with (
        patch.object(people, "target", return_value={"user_id": str(user.id)}),
        pytest.raises(HTTPException) as error,
    ):
        people.follow(user, "owner-token", "myself")
    assert error.value.status_code == 422


def test_closed_followed_profiles_can_still_be_unfollowed_without_reading_private_metadata() -> (
    None
):
    config = Settings(_env_file=None, catalog_source="local")
    account = AccountStore(config, Catalog(config))
    people = PeopleStore(account)
    user = AccountUser(id=uuid4())
    target = uuid4()
    with patch.object(account, "request", return_value=(None, None)) as request:
        people.unfollow(user, "owner-token", target)
    assert f"follower_id=eq.{user.id}" in request.call_args.args[0]
    assert request.call_args.args[1:3] == ("owner-token", "DELETE")


def test_people_recommendations_exclude_self_and_followed_profiles_and_use_anonymous_corpus() -> (
    None
):
    config = Settings(_env_file=None, catalog_source="local")
    account = AccountStore(config, Catalog(config))
    people = PeopleStore(account)
    user = AccountUser(id=uuid4())
    followed = uuid4()
    other = uuid4()
    item = items()[0]
    own = Taste()
    own.add(item, 1)

    def candidate(owner: str, username: str) -> dict[str, object]:
        return {
            "user_id": owner,
            "username": username,
            "display_name": username,
            "bio": "",
            "avatar_path": None,
            "signals": [],
            "top_fives": {"movie": [item.model_dump(mode="json")]},
        }

    corpus = {
        "items": [
            candidate(str(user.id), "myself"),
            candidate(str(followed), "followed"),
            candidate(str(other), "someone"),
        ],
        "total": 3,
    }
    with (
        patch.object(people, "own_taste", return_value=own),
        patch.object(people, "followed_ids", return_value={str(followed)}),
        patch.object(account, "request", return_value=(corpus, None)) as request,
    ):
        result = people.suggestions(user, "owner-token", 12, 0)
    assert [r.profile.username for r in result.items] == ["someone"]
    assert item.title in result.items[0].reason
    assert request.call_args.args[1] is None
