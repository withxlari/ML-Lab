import json
from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.catalog import Catalog, CatalogUnavailable, MediaItem
from app.core.config import Settings
from app.data_quality import LibraryPreparation, prepare_library


class AccountUser(BaseModel):
    id: UUID
    email: str | None = None


class Profile(BaseModel):
    id: UUID
    display_name: str | None = None
    avatar_path: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    updated_at: datetime
    onboarding_status: Literal["not_started", "skipped", "completed"] = "not_started"


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    display_name: Annotated[str, Field(min_length=1, max_length=80)] | None


class AvatarUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    avatar_path: Annotated[str, Field(pattern=r"^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$")] | None


class SaveFavorite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item: dict[str, Any]


class ImportFavorites(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: Annotated[list[dict[str, Any]], Field(min_length=1, max_length=100)]


LibraryStatus = Literal["planned", "in_progress", "completed", "paused", "dropped"]
LibraryReaction = Literal["liked", "disliked"]


class LibraryFeedback(BaseModel):
    media_key: str
    status: LibraryStatus
    rating: Annotated[int, Field(ge=1, le=5, strict=True)] | None
    is_favorite: bool
    reaction: LibraryReaction | None = None


class LibraryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: LibraryStatus | None = None
    rating: Annotated[int, Field(ge=1, le=5, strict=True)] | None = None
    is_favorite: Annotated[bool, Field(strict=True)] | None = None
    reaction: LibraryReaction | None = None

    @model_validator(mode="after")
    def valid_patch(self) -> "LibraryUpdate":
        if not self.model_fields_set:
            raise ValueError("Informe pelo menos uma preferência.")
        for field in ("status", "is_favorite"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} não pode ser nulo.")
        return self


class LibraryPage(BaseModel):
    items: list[MediaItem]
    entries: list[LibraryFeedback]
    total: int
    limit: int
    offset: int


class CompletedWork(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item: dict[str, Any]
    reaction: LibraryReaction | None = None


class TasteChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item: dict[str, Any]
    rating: Annotated[int, Field(ge=1, le=5, strict=True)] | None = None
    is_favorite: Annotated[bool, Field(strict=True)] | None = None

    @model_validator(mode="after")
    def valid_choice(self) -> "TasteChoice":
        if not self.model_fields_set - {"item"}:
            raise ValueError("Escolha uma nota ou favorito.")
        if "is_favorite" in self.model_fields_set and self.is_favorite is None:
            raise ValueError("Favorito deve ser verdadeiro ou falso.")
        return self


class TasteResult(BaseModel):
    item: MediaItem
    entry: LibraryFeedback


class OnboardingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["skip", "complete"]


class AccountStore:
    def __init__(self, settings: Settings, catalog: Catalog) -> None:
        self.settings = settings
        self.catalog = catalog

    def request(
        self,
        path: str,
        token: str | None,
        method: str = "GET",
        body: object = None,
        prefer: str | None = None,
    ) -> tuple[Any, str | None]:
        if self.settings.supabase_url is None or self.settings.supabase_publishable_key is None:
            raise HTTPException(503, "O acesso à conta está indisponível no momento.")
        headers = {
            "apikey": self.settings.supabase_publishable_key.get_secret_value(),
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if prefer:
            headers["Prefer"] = prefer
        request = Request(
            str(self.settings.supabase_url).rstrip("/") + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=8) as response:
                raw = response.read(8_000_001)
                if len(raw) > 8_000_000:
                    raise HTTPException(503, "A resposta da conta excedeu o tamanho permitido.")
                return (json.loads(raw) if raw else None, response.headers.get("Content-Range"))
        except HTTPError as error:
            if error.code == 409:
                raise HTTPException(409, "Este nome de usuário já está em uso.") from None
            if error.code in {401, 403}:
                raise HTTPException(401, "Sua sessão expirou. Entre novamente.") from None
            raise HTTPException(
                503, "Não foi possível acessar sua conta. Tente novamente."
            ) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise HTTPException(
                503, "Não foi possível acessar sua conta. Tente novamente."
            ) from None

    def user(self, token: str) -> AccountUser:
        raw, _ = self.request("/auth/v1/user", token)
        try:
            return AccountUser.model_validate(raw)
        except ValidationError:
            raise HTTPException(401, "Sua sessão não é válida. Entre novamente.") from None

    def ensure_profile(self, user: AccountUser, token: str) -> None:
        self.request(
            "/rest/v1/profiles?on_conflict=id",
            token,
            "POST",
            {"id": str(user.id)},
            "resolution=ignore-duplicates,return=minimal",
        )

    def profile(self, user: AccountUser, token: str) -> Profile:
        self.ensure_profile(user, token)
        rows, _ = self.request(
            "/rest/v1/profiles?" + urlencode({"id": f"eq.{user.id}", "select": "*"}), token
        )
        try:
            result = Profile.model_validate(rows[0])
            result.avatar_url = self.avatar_url(result.avatar_path, token)
            return result
        except (ValidationError, TypeError, IndexError):
            raise HTTPException(503, "Não foi possível carregar seu perfil.") from None

    def update_profile(self, user: AccountUser, token: str, update: ProfileUpdate) -> Profile:
        self.ensure_profile(user, token)
        rows, _ = self.request(
            "/rest/v1/profiles?" + urlencode({"id": f"eq.{user.id}"}),
            token,
            "PATCH",
            update.model_dump(),
            "return=representation",
        )
        result = Profile.model_validate(rows[0])
        result.avatar_url = self.avatar_url(result.avatar_path, token)
        return result

    def avatar_url(self, path: str | None, token: str | None) -> str | None:
        if not path or self.settings.supabase_url is None:
            return None
        try:
            raw, _ = self.request(
                "/storage/v1/object/sign/avatars/" + quote(path, safe="/"),
                token,
                "POST",
                {"expiresIn": 120},
            )
            signed = raw.get("signedURL") if isinstance(raw, dict) else None
            if isinstance(signed, str) and signed.startswith("/object/sign/avatars/"):
                return str(self.settings.supabase_url).rstrip("/") + "/storage/v1" + signed
        except HTTPException:
            return None
        return None

    def update_avatar(self, user: AccountUser, token: str, update: AvatarUpdate) -> Profile:
        if update.avatar_path and update.avatar_path.split("/")[0] != str(user.id):
            raise HTTPException(422, "Escolha uma foto enviada pela sua própria conta.")
        self.ensure_profile(user, token)
        self.request(
            "/rest/v1/profiles?" + urlencode({"id": f"eq.{user.id}"}),
            token,
            "PATCH",
            {"avatar_path": update.avatar_path},
            "return=minimal",
        )
        return self.profile(user, token)

    def onboarding(self, user: AccountUser, token: str, update: OnboardingUpdate) -> Profile:
        self.ensure_profile(user, token)
        rows, _ = self.request(
            "/rest/v1/profiles?" + urlencode({"id": f"eq.{user.id}"}),
            token,
            "PATCH",
            {"onboarding_status": "skipped" if update.action == "skip" else "completed"},
            "return=representation",
        )
        try:
            return Profile.model_validate(rows[0])
        except (ValidationError, TypeError, IndexError, KeyError):
            raise HTTPException(
                503, "Não foi possível concluir esta etapa. Tente novamente."
            ) from None

    def choose_taste(self, user: AccountUser, token: str, choice: TasteChoice) -> TasteResult:
        item = self.validate_item(choice.item)
        self.ensure_profile(user, token)
        rows, _ = self.request(
            "/rest/v1/user_library?on_conflict=user_id,media_key",
            token,
            "POST",
            {
                "user_id": str(user.id),
                "media_key": item.slug,
                "media_snapshot": item.model_dump(mode="json"),
                **choice.model_dump(exclude={"item"}, exclude_unset=True),
            },
            "resolution=merge-duplicates,return=representation",
        )
        try:
            row = rows[0]
            return TasteResult(
                item=MediaItem.model_validate(row["media_snapshot"]),
                entry=LibraryFeedback.model_validate(row),
            )
        except (ValidationError, TypeError, IndexError, KeyError):
            raise HTTPException(
                503, "Não foi possível guardar sua escolha. Tente novamente."
            ) from None

    def complete_work(self, user: AccountUser, token: str, body: CompletedWork) -> TasteResult:
        item = self.validate_item(body.item)
        self.ensure_profile(user, token)
        raw, _ = self.request(
            "/rest/v1/rpc/record_completed_work",
            token,
            "POST",
            {"p_item": item.model_dump(mode="json"), "p_reaction": body.reaction},
        )
        return TasteResult.model_validate(raw)

    def library(self, user: AccountUser, token: str, limit: int, offset: int) -> LibraryPage:
        self.ensure_profile(user, token)
        params = urlencode(
            {
                "user_id": f"eq.{user.id}",
                "select": "media_snapshot,media_key,status,rating,is_favorite,reaction",
                "order": "created_at.desc,media_key",
                "limit": limit,
                "offset": offset,
            }
        )
        rows, content_range = self.request(
            "/rest/v1/user_library?" + params, token, prefer="count=exact"
        )
        try:
            items = [MediaItem.model_validate(row["media_snapshot"]) for row in rows]
            entries = [LibraryFeedback.model_validate(row) for row in rows]
            total = int((content_range or "").rsplit("/", 1)[-1])
            return LibraryPage(
                items=items, entries=entries, total=total, limit=limit, offset=offset
            )
        except (ValidationError, TypeError, KeyError, ValueError):
            raise HTTPException(503, "Não foi possível ler sua lista. Tente novamente.") from None

    def update_library(
        self, user: AccountUser, token: str, slug: str, update: LibraryUpdate
    ) -> LibraryFeedback:
        rows, _ = self.request(
            "/rest/v1/user_library?"
            + urlencode(
                {
                    "user_id": f"eq.{user.id}",
                    "media_key": f"eq.{slug}",
                    "select": "media_key,status,rating,is_favorite,reaction",
                }
            ),
            token,
            "PATCH",
            update.model_dump(exclude_unset=True),
            "return=representation",
        )
        if rows == []:
            raise HTTPException(404, "Guarde o título na sua lista antes de avaliar.")
        try:
            return LibraryFeedback.model_validate(rows[0])
        except (ValidationError, TypeError, IndexError, KeyError):
            raise HTTPException(503, "Não foi possível atualizar este título.") from None

    def preparation(self, user: AccountUser, token: str) -> LibraryPreparation:
        items: list[MediaItem] = []
        entries: list[LibraryFeedback] = []
        expected: int | None = None
        while True:
            page = self.library(user, token, 100, len(items))
            expected = page.total if expected is None else expected
            if page.total != expected or expected > 1000:
                raise HTTPException(503, "A lista mudou ou excedeu o limite desta preparação.")
            if len(page.items) != min(100, expected - len(items)):
                raise HTTPException(503, "A lista retornou uma página incompleta.")
            items.extend(page.items)
            entries.extend(page.entries)
            if len(items) == expected:
                return prepare_library(items, entries)

    def validate_item(self, raw: dict[str, Any], resolve: bool = True) -> MediaItem:
        slug = raw.get("slug")
        try:
            item = MediaItem.model_validate(
                {
                    **raw,
                    "id": raw.get("id")
                    or str(uuid5(NAMESPACE_URL, f"https://nexo.local/saved/{slug}")),
                }
            )
        except ValidationError:
            raise HTTPException(422, "Os dados do título não são válidos.") from None
        if not resolve:
            return item

        try:
            known = self.catalog.canonical_items([item])
        except CatalogUnavailable:
            known = []
        if known and item.media_type == "book" and item.isbn_13 != known[0].isbn_13:
            return item
        return known[0] if known else item

    def save(self, user: AccountUser, token: str, slug: str, raw: dict[str, Any]) -> MediaItem:
        item = self.validate_item(raw)
        if item.slug != slug:
            raise HTTPException(422, "O identificador não corresponde ao título.")
        self.ensure_profile(user, token)
        self.request(
            "/rest/v1/user_library?on_conflict=user_id,media_key",
            token,
            "POST",
            {
                "user_id": str(user.id),
                "media_key": slug,
                "media_snapshot": item.model_dump(mode="json"),
            },
            "resolution=merge-duplicates,return=minimal",
        )
        return item

    def remove(self, user: AccountUser, token: str, slug: str) -> None:
        self.request(
            "/rest/v1/user_library?"
            + urlencode({"user_id": f"eq.{user.id}", "media_key": f"eq.{slug}"}),
            token,
            "DELETE",
        )

    def import_items(self, user: AccountUser, token: str, raw: list[dict[str, Any]]) -> int:
        items = {item.slug: item for item in (self.validate_item(row, False) for row in raw)}
        try:
            known = self.catalog.canonical_items(list(items.values()))
        except CatalogUnavailable:
            known = []
        keys = {
            (item.provider, item.provider_entity_type, item.external_id): item for item in known
        }
        items = {
            item.slug: item
            for item in (
                keys.get((row.provider, row.provider_entity_type, row.external_id), row)
                for row in items.values()
            )
        }
        self.ensure_profile(user, token)
        self.request(
            "/rest/v1/user_library?on_conflict=user_id,media_key",
            token,
            "POST",
            [
                {
                    "user_id": str(user.id),
                    "media_key": slug,
                    "media_snapshot": item.model_dump(mode="json"),
                }
                for slug, item in items.items()
            ],
            "resolution=ignore-duplicates,return=minimal",
        )
        return len(items)
