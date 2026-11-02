from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.account import AccountStore, AccountUser
from app.catalog import MediaItem, MediaType

Tag = Annotated[str, Field(min_length=1, max_length=80)]
Tags = Annotated[list[Tag], Field(max_length=20)]


class CategoryTaste(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    liked_genres: Tags = Field(default_factory=list)
    avoided_genres: Tags = Field(default_factory=list)
    liked_themes: Tags = Field(default_factory=list)
    avoided_themes: Tags = Field(default_factory=list)

    @model_validator(mode="after")
    def no_conflicts(self) -> CategoryTaste:
        if {x.casefold() for x in self.liked_genres} & {x.casefold() for x in self.avoided_genres}:
            raise ValueError("Um gênero não pode estar nos dois lados.")
        return self


class TastePreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    categories: dict[MediaType, CategoryTaste] = Field(default_factory=dict)
    like_text: Annotated[str, Field(max_length=2000)] = ""
    avoid_text: Annotated[str, Field(max_length=2000)] = ""


class PublicProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    username: Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_-]{2,29}$")]
    display_name: Annotated[str, Field(min_length=1, max_length=80)]
    bio: Annotated[str, Field(max_length=500)] = ""
    is_public: bool = False
    show_ratings: bool = False
    show_stats: bool = False
    show_followers: bool = False
    show_following: bool = False
    top_fives: dict[MediaType, Annotated[list[dict[str, Any]], Field(max_length=5)]] = Field(
        default_factory=dict
    )

    @field_validator("username")
    @classmethod
    def reserved(cls, value: str) -> str:
        if value in {"admin", "api", "nexo", "account", "profile", "support", "settings"}:
            raise ValueError("Escolha outro nome de usuário.")
        return value


class ProfileStats(BaseModel):
    explored: int | None = None
    favorites: int | None = None
    followers: int | None = None
    following: int | None = None


class PublicProfile(BaseModel):
    username: str
    display_name: str
    bio: str
    avatar_url: str | None = None
    is_public: bool
    show_ratings: bool
    show_stats: bool = False
    show_followers: bool = False
    show_following: bool = False
    stats: ProfileStats = Field(default_factory=ProfileStats)
    top_fives: dict[MediaType, list[MediaItem]]
    updated_at: datetime


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    item: dict[str, Any]
    body: Annotated[str, Field(min_length=1, max_length=4000)]
    rating: Annotated[int, Field(strict=True, ge=1, le=5)] | None = None
    visibility: Literal["private", "public"] = "private"
    spoiler: bool = False


class Review(BaseModel):
    media_key: str
    item: MediaItem
    body: str
    rating: int | None
    visibility: Literal["private", "public"]
    spoiler: bool
    updated_at: datetime


class FeedbackUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item: dict[str, Any]
    action: Literal["more_like_this", "not_interested", "already_known"]


class Feedback(BaseModel):
    media_key: str
    item: MediaItem
    action: Literal["more_like_this", "not_interested", "already_known"]
    updated_at: datetime


class ActivityEntry(BaseModel):
    item: MediaItem
    rating: int | None
    body: str | None = None
    spoiler: bool = False
    updated_at: datetime


class RecentActivity(BaseModel):
    item: MediaItem
    rating: Annotated[int, Field(ge=1, le=5)] | None = None
    has_review: bool = False
    updated_at: datetime


class ActivityPage(BaseModel):
    items: list[ActivityEntry]
    recent: list[RecentActivity] = Field(default_factory=list)
    total: int
    limit: int
    offset: int


class CommunityStore:
    def __init__(self, account: AccountStore) -> None:
        self.account = account

    def rows(self, table: str, token: str | None, params: dict[str, Any]) -> list[dict[str, Any]]:
        raw, _ = self.account.request("/rest/v1/" + table + "?" + urlencode(params), token)
        if not isinstance(raw, list):
            raise HTTPException(503, "Não foi possível ler estas informações.")
        return list(raw)

    def preferences(self, user: AccountUser, token: str) -> TastePreferences:
        rows = self.rows(
            "user_preferences", token, {"user_id": f"eq.{user.id}", "select": "preferences"}
        )
        return (
            TastePreferences.model_validate(rows[0]["preferences"]) if rows else TastePreferences()
        )

    def save_preferences(
        self, user: AccountUser, token: str, preferences: TastePreferences
    ) -> TastePreferences:
        self.account.ensure_profile(user, token)
        self.account.request(
            "/rest/v1/user_preferences?on_conflict=user_id",
            token,
            "POST",
            {"user_id": str(user.id), "preferences": preferences.model_dump()},
            "resolution=merge-duplicates,return=minimal",
        )
        return preferences

    def own_profile(self, user: AccountUser, token: str) -> PublicProfile | None:
        rows = self.rows("public_profiles", token, {"user_id": f"eq.{user.id}", "select": "*"})
        return self.profile_with_avatar(rows[0], token) if rows else None

    def profile_with_avatar(self, row: dict[str, Any], token: str | None) -> PublicProfile:
        return PublicProfile.model_validate(
            {**row, "avatar_url": self.account.avatar_url(row.get("avatar_path"), token)}
        )

    def save_profile(
        self, user: AccountUser, token: str, body: PublicProfileUpdate
    ) -> PublicProfile:
        self.account.ensure_profile(user, token)
        tops: dict[str, list[dict[str, Any]]] = {}
        for category, raw in body.top_fives.items():
            items = [self.account.validate_item(item, resolve=False) for item in raw]
            if any(item.media_type != category for item in items):
                raise HTTPException(422, "Cada obra deve estar na categoria correspondente.")
            identities = {
                (item.provider, item.provider_entity_type, item.external_id or item.slug)
                for item in items
            }
            if len(identities) != len(items):
                raise HTTPException(422, "Não repita uma obra no mesmo Top 5.")
            tops[category] = [
                item.model_copy(
                    update={"description": (item.description or "")[:1800] or None}
                ).model_dump(mode="json")
                for item in items
            ]
        raw, _ = self.account.request(
            "/rest/v1/public_profiles?on_conflict=user_id",
            token,
            "POST",
            {"user_id": str(user.id), **body.model_dump(exclude={"top_fives"}), "top_fives": tops},
            "resolution=merge-duplicates,return=representation",
        )
        return self.profile_with_avatar(raw[0], token)

    def public_profile(self, username: str) -> PublicProfile:
        raw, _ = self.account.request(
            "/rest/v1/rpc/get_public_profile", None, "POST", {"p_username": username}
        )
        if not isinstance(raw, dict):
            raise HTTPException(404, "Este perfil não está disponível.")
        return self.profile_with_avatar(raw, None)

    def activity(self, username: str, limit: int, offset: int, kind: str = "all") -> ActivityPage:
        self.public_profile(username)
        raw, _ = self.account.request(
            "/rest/v1/rpc/get_public_activity",
            None,
            "POST",
            {"p_username": username, "p_limit": limit, "p_offset": offset, "p_kind": kind},
        )
        return ActivityPage.model_validate(raw)

    def reviews(self, user: AccountUser, token: str) -> list[Review]:
        rows = self.rows(
            "user_reviews",
            token,
            {
                "user_id": f"eq.{user.id}",
                "select": "media_key,media_snapshot,body,rating,visibility,spoiler,updated_at",
                "order": "updated_at.desc,media_key",
                "limit": 1000,
            },
        )
        return [Review.model_validate({**row, "item": row["media_snapshot"]}) for row in rows]

    def review(self, user: AccountUser, token: str, slug: str) -> Review | None:
        rows = self.rows(
            "user_reviews",
            token,
            {
                "user_id": f"eq.{user.id}",
                "media_key": f"eq.{slug}",
                "select": "media_key,media_snapshot,body,rating,visibility,spoiler,updated_at",
            },
        )
        return (
            Review.model_validate({**rows[0], "item": rows[0]["media_snapshot"]}) if rows else None
        )

    def save_review(self, user: AccountUser, token: str, slug: str, body: ReviewUpdate) -> Review:
        item = self.account.validate_item(body.item)
        if item.slug != slug:
            raise HTTPException(422, "A avaliação deve corresponder à obra aberta.")
        self.account.ensure_profile(user, token)
        raw, _ = self.account.request(
            "/rest/v1/rpc/save_user_review",
            token,
            "POST",
            {
                "p_item": item.model_dump(mode="json"),
                "p_rating": body.rating,
                "p_body": body.body,
                "p_visibility": body.visibility,
                "p_spoiler": body.spoiler,
            },
        )
        return Review.model_validate({**raw, "item": raw["media_snapshot"]})

    def delete_review(self, user: AccountUser, token: str, slug: str) -> None:
        self.account.request(
            "/rest/v1/user_reviews?"
            + urlencode({"user_id": f"eq.{user.id}", "media_key": f"eq.{slug}"}),
            token,
            "DELETE",
        )

    def feedback(self, user: AccountUser, token: str) -> list[Feedback]:
        rows = self.rows(
            "recommendation_feedback",
            token,
            {
                "user_id": f"eq.{user.id}",
                "select": "media_key,media_snapshot,action,updated_at",
                "order": "updated_at.desc",
                "limit": 1000,
            },
        )
        return [Feedback.model_validate({**row, "item": row["media_snapshot"]}) for row in rows]

    def save_feedback(
        self, user: AccountUser, token: str, slug: str, body: FeedbackUpdate
    ) -> Feedback:
        item = self.account.validate_item(body.item)
        if item.slug != slug:
            raise HTTPException(422, "O feedback deve corresponder à obra.")
        self.account.ensure_profile(user, token)
        raw, _ = self.account.request(
            "/rest/v1/recommendation_feedback?on_conflict=user_id,media_key",
            token,
            "POST",
            {
                "user_id": str(user.id),
                "media_key": slug,
                "media_snapshot": item.model_dump(mode="json"),
                "action": body.action,
            },
            "resolution=merge-duplicates,return=representation",
        )
        return Feedback.model_validate({**raw[0], "item": raw[0]["media_snapshot"]})

    def delete_feedback(self, user: AccountUser, token: str, slug: str) -> None:
        self.account.request(
            "/rest/v1/recommendation_feedback?"
            + urlencode({"user_id": f"eq.{user.id}", "media_key": f"eq.{slug}"}),
            token,
            "DELETE",
        )
