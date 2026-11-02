from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlencode
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from app.account import AccountStore, AccountUser
from app.candidates import media_identity
from app.catalog import MediaItem
from app.community import CommunityStore
from app.personalization import genre_keys
from app.recommendations import GENRE_LABELS, preference_weight


class Person(BaseModel):
    username: str
    display_name: str
    bio: str = ""
    avatar_url: str | None = None


class PersonSuggestion(BaseModel):
    profile: Person
    reason: str
    shared_items: list[MediaItem]
    shared_genres: list[str]


class PeoplePage(BaseModel):
    status: Literal["ready", "needs_tastes", "no_matches"]
    items: list[PersonSuggestion] = []
    total: int = 0
    limit: int
    offset: int


class FollowStatus(BaseModel):
    following: bool
    followed_id: UUID
    is_self: bool = False


class FollowedPerson(BaseModel):
    followed_id: UUID
    profile: Person | None


class FollowingPage(BaseModel):
    items: list[FollowedPerson]
    total: int
    limit: int
    offset: int


class PublicConnections(BaseModel):
    items: list[Person]
    total: int
    limit: int
    offset: int


@dataclass
class Taste:
    works: dict[str, tuple[MediaItem, float]] = field(default_factory=dict)

    def add(self, item: MediaItem, weight: float) -> None:
        key = media_identity(item)
        existing = self.works.get(key)
        if weight:
            if not existing or weight < 0 or (existing[1] > 0 and weight > existing[1]):
                self.works[key] = item, weight

    def positives(self) -> set[str]:
        return {key for key, (_, weight) in self.works.items() if weight > 0}

    def genres(self) -> set[str]:
        return {
            g for item, weight in self.works.values() if weight > 0 for g in genre_keys(item.genres)
        }


def public_taste(row: dict[str, Any]) -> Taste:
    taste = Taste()
    for signal in row.get("signals", []):
        try:
            item = MediaItem.model_validate(signal["item"])
            rating = signal["rating"]
            if rating in {1, 2, 4, 5}:
                taste.add(item, {1: -1.0, 2: -0.5, 4: 0.5, 5: 1.0}[rating])
        except (ValidationError, KeyError, TypeError):
            continue
    for items in row.get("top_fives", {}).values():
        for position, raw in enumerate(items[:5]):
            try:
                taste.add(MediaItem.model_validate(raw), 1.5 - position * 0.1)
            except ValidationError:
                continue
    return taste


def compare_people(left: Taste, right: Taste) -> tuple[float, list[MediaItem], list[str]]:
    a, b = left.positives(), right.positives()
    if not a or not b:
        return 0, [], []
    common = a & b
    conflict = sum(
        1
        for key in left.works.keys() & right.works.keys()
        if left.works[key][1] * right.works[key][1] < 0
    )
    genres = left.genres() & right.genres()

    specific = genres - {"drama", "comedy", "fiction", "family", "action", "adventure", "animation"}
    if not common and (len(specific) < 2 or min(len(a), len(b)) < 3):
        return 0, [], []
    overlap = sum(left.works[k][1] * right.works[k][1] for k in common)
    norm = math.sqrt(sum(left.works[k][1] ** 2 for k in a) * sum(right.works[k][1] ** 2 for k in b))
    genre_score = len(specific) / max(1, len(left.genres() | right.genres()))
    score = 0.8 * overlap / norm + 0.2 * genre_score - 0.2 * conflict
    shared = [
        right.works[k][0]
        for k in sorted(
            common, key=lambda k: (-left.works[k][1] * right.works[k][1], right.works[k][0].title)
        )
    ]
    labels = sorted(GENRE_LABELS.get(g, g.replace("_", " ")) for g in specific)
    return (score if score > 0.03 else 0), shared, labels


class PeopleStore:
    def __init__(self, account: AccountStore) -> None:
        self.account = account
        self.community = CommunityStore(account)

    def target(self, username: str) -> dict[str, Any]:
        rows = self.community.rows(
            "public_profiles",
            None,
            {
                "username": f"eq.{username}",
                "is_public": "eq.true",
                "select": "user_id,username,display_name,bio,avatar_path",
                "limit": 1,
            },
        )
        if not rows:
            raise HTTPException(404, "Este perfil não está disponível.")
        return rows[0]

    def search_profiles(self, query: str, limit: int, offset: int) -> PublicConnections:
        raw, _ = self.account.request(
            "/rest/v1/rpc/search_public_profiles",
            None,
            "POST",
            {"p_query": query, "p_limit": limit, "p_offset": offset},
        )
        if not isinstance(raw, dict):
            raise HTTPException(503, "Não conseguimos buscar os perfis agora.")
        with ThreadPoolExecutor(max_workers=4) as executor:
            items = list(executor.map(self.person, raw["items"]))
        return PublicConnections(items=items, total=raw["total"], limit=limit, offset=offset)

    def public_connections(
        self, username: str, direction: Literal["followers", "following"], limit: int, offset: int
    ) -> PublicConnections:
        raw, _ = self.account.request(
            "/rest/v1/rpc/get_profile_connections",
            None,
            "POST",
            {
                "p_username": username,
                "p_direction": direction,
                "p_limit": limit,
                "p_offset": offset,
            },
        )
        if not isinstance(raw, dict):
            raise HTTPException(404, "Esta lista não está disponível.")
        with ThreadPoolExecutor(max_workers=4) as executor:
            items = list(executor.map(self.person, raw["items"]))
        return PublicConnections(items=items, total=raw["total"], limit=limit, offset=offset)

    def person(self, row: dict[str, Any]) -> Person:
        return Person.model_validate(
            {**row, "avatar_url": self.account.avatar_url(row.get("avatar_path"), None)}
        )

    def status(self, user: AccountUser, token: str, username: str) -> FollowStatus:
        target = UUID(self.target(username)["user_id"])
        rows = self.community.rows(
            "profile_follows",
            token,
            {
                "follower_id": f"eq.{user.id}",
                "followed_id": f"eq.{target}",
                "select": "followed_id",
                "limit": 1,
            },
        )
        return FollowStatus(followed_id=target, following=bool(rows), is_self=target == user.id)

    def follow(self, user: AccountUser, token: str, username: str) -> FollowStatus:
        target = UUID(self.target(username)["user_id"])
        if target == user.id:
            raise HTTPException(422, "Você não pode seguir seu próprio perfil.")
        self.account.ensure_profile(user, token)
        self.account.request(
            "/rest/v1/profile_follows?on_conflict=follower_id,followed_id",
            token,
            "POST",
            {"follower_id": str(user.id), "followed_id": str(target)},
            "resolution=ignore-duplicates,return=minimal",
        )
        return FollowStatus(followed_id=target, following=True)

    def unfollow(self, user: AccountUser, token: str, target: UUID) -> None:
        self.account.request(
            "/rest/v1/profile_follows?"
            + urlencode({"follower_id": f"eq.{user.id}", "followed_id": f"eq.{target}"}),
            token,
            "DELETE",
        )

    def following(self, user: AccountUser, token: str, limit: int, offset: int) -> FollowingPage:
        raw, count = self.account.request(
            "/rest/v1/profile_follows?"
            + urlencode(
                {
                    "follower_id": f"eq.{user.id}",
                    "select": "followed_id",
                    "order": "created_at.desc,followed_id",
                    "limit": limit,
                    "offset": offset,
                }
            ),
            token,
            prefer="count=exact",
        )
        if not isinstance(raw, list) or not count or not count.split("/")[-1].isdigit():
            raise HTTPException(503, "Não conseguimos abrir os perfis que você segue.")
        ids = [str(UUID(row["followed_id"])) for row in raw]
        profiles = (
            self.community.rows(
                "public_profiles",
                None,
                {
                    "user_id": "in.(" + ",".join(ids) + ")",
                    "is_public": "eq.true",
                    "select": "user_id,username,display_name,bio,avatar_path",
                },
            )
            if ids
            else []
        )
        by_id = {row["user_id"]: row for row in profiles}
        with ThreadPoolExecutor(max_workers=4) as executor:
            people = list(executor.map(self.person, profiles))
        rendered = {row["user_id"]: person for row, person in zip(profiles, people, strict=True)}
        return FollowingPage(
            items=[
                FollowedPerson(
                    followed_id=UUID(key), profile=rendered.get(key) if key in by_id else None
                )
                for key in ids
            ],
            total=int(count.split("/")[-1]),
            limit=limit,
            offset=offset,
        )

    def followed_ids(self, user: AccountUser, token: str) -> set[str]:
        result: set[str] = set()
        expected: int | None = None
        while True:
            raw, count = self.account.request(
                "/rest/v1/profile_follows?"
                + urlencode(
                    {
                        "follower_id": f"eq.{user.id}",
                        "select": "followed_id",
                        "order": "followed_id",
                        "limit": 1000,
                        "offset": len(result),
                    }
                ),
                token,
                prefer="count=exact",
            )
            if not isinstance(raw, list) or not count or not count.split("/")[-1].isdigit():
                raise HTTPException(503, "Não conseguimos conferir os perfis já seguidos.")
            total = int(count.split("/")[-1])
            if (
                total > 10000
                or (expected is not None and total != expected)
                or len(raw) != min(1000, total - len(result))
            ):
                raise HTTPException(503, "A lista de perfis mudou. Tente novamente.")
            expected = total
            previous = len(result)
            result.update(str(UUID(row["followed_id"])) for row in raw)
            if len(result) >= total:
                return result
            if len(result) == previous:
                raise HTTPException(503, "A lista de perfis chegou incompleta.")

    def own_taste(self, user: AccountUser, token: str) -> Taste:
        library = self.account.preparation(user, token)
        by_slug = {r.item.slug: r.item for r in library.items if r.valid}
        taste = Taste()
        for signal in library.signals:
            if signal.media_key in by_slug:
                taste.add(by_slug[signal.media_key], preference_weight(signal))
        profile = self.community.own_profile(user, token)
        if profile:
            for items in profile.top_fives.values():
                for position, item in enumerate(items):
                    taste.add(item, 1.5 - position * 0.1)
        return taste

    def suggestions(self, user: AccountUser, token: str, limit: int, offset: int) -> PeoplePage:
        own = self.own_taste(user, token)
        if not own.positives():
            return PeoplePage(status="needs_tastes", limit=limit, offset=offset)
        excluded = {str(user.id), *self.followed_ids(user, token)}
        rows: list[dict[str, Any]] = []
        expected: int | None = None
        while True:
            raw, _ = self.account.request(
                "/rest/v1/rpc/discover_public_people",
                None,
                "POST",
                {"p_limit": 25, "p_offset": len(rows)},
            )
            if (
                not isinstance(raw, dict)
                or not isinstance(raw.get("items"), list)
                or not isinstance(raw.get("total"), int)
            ):
                raise HTTPException(503, "Não conseguimos comparar os perfis agora.")
            if raw["total"] > 5000 or (expected is not None and raw["total"] != expected):
                raise HTTPException(503, "A seleção de perfis mudou. Tente novamente.")
            expected = raw["total"]
            if len(raw["items"]) != min(25, expected - len(rows)):
                raise HTTPException(503, "A seleção de perfis chegou incompleta.")
            rows.extend(raw["items"])
            if len(rows) >= expected:
                break
        ranked: list[tuple[float, dict[str, Any], list[MediaItem], list[str]]] = []
        for row in rows:
            if row["user_id"] in excluded:
                continue
            score, shared, genres = compare_people(own, public_taste(row))
            if score:
                ranked.append((score, row, shared, genres))
        ranked.sort(key=lambda r: (-r[0], r[1]["username"]))
        selected = ranked[offset : offset + limit]
        with ThreadPoolExecutor(max_workers=4) as executor:
            profiles = list(executor.map(self.person, [r[1] for r in selected]))
        result = []
        for profile, (_, _, shared, genres) in zip(profiles, selected, strict=True):
            reason = (
                ("Vocês gostaram de " + ", ".join(item.title for item in shared[:2]) + ".")
                if shared
                else ("Favoritos com " + ", ".join(genres[:3]) + " em comum.")
            )
            result.append(
                PersonSuggestion(
                    profile=profile,
                    reason=reason,
                    shared_items=shared[:3],
                    shared_genres=genres[:4],
                )
            )
        return PeoplePage(
            status="ready" if ranked else "no_matches",
            items=result,
            total=len(ranked),
            limit=limit,
            offset=offset,
        )
