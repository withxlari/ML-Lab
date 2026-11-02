from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.account import (
    AccountStore,
    AccountUser,
    AvatarUpdate,
    CompletedWork,
    ImportFavorites,
    LibraryFeedback,
    LibraryPage,
    LibraryUpdate,
    OnboardingUpdate,
    Profile,
    ProfileUpdate,
    SaveFavorite,
    TasteChoice,
    TasteResult,
)
from app.catalog import CatalogUnavailable, MediaItem, MediaType
from app.data_quality import LibraryPreparation
from app.personalization import PersonalizationService
from app.recommendations import RecommendationPage, RecommendationService
from app.semantic import EmbeddingsUnavailable


def create_account_router(
    store: AccountStore, personalized: PersonalizationService | None = None
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/me", tags=["account"])
    bearer = HTTPBearer(auto_error=False)
    recommendations = RecommendationService(store.catalog)

    def authenticate(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> tuple[AccountUser, str]:
        if credentials is None or not credentials.credentials.strip():
            raise HTTPException(
                401, "Entre na sua conta para continuar.", headers={"WWW-Authenticate": "Bearer"}
            )
        return store.user(credentials.credentials), credentials.credentials

    Current = Annotated[tuple[AccountUser, str], Depends(authenticate)]
    Slug = Annotated[str, Path(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)]

    @router.get("", response_model=Profile)
    def profile(current: Current) -> Profile:
        return store.profile(*current)

    @router.patch("/avatar", response_model=Profile)
    def avatar(update: AvatarUpdate, current: Current) -> Profile:
        return store.update_avatar(*current, update)

    @router.patch("", response_model=Profile)
    def update_profile(update: ProfileUpdate, current: Current) -> Profile:
        return store.update_profile(*current, update)

    @router.get("/library", response_model=LibraryPage)
    def library(
        current: Current,
        limit: Annotated[int, Query(ge=1, le=100)] = 100,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> LibraryPage:
        return store.library(*current, limit, offset)

    @router.put("/onboarding", response_model=Profile)
    def onboarding(body: OnboardingUpdate, current: Current) -> Profile:
        return store.onboarding(*current, body)

    @router.post("/tastes", response_model=TasteResult)
    def choose_taste(body: TasteChoice, current: Current) -> TasteResult:
        return store.choose_taste(*current, body)

    @router.post("/library/import")
    def import_library(body: ImportFavorites, current: Current) -> dict[str, int]:
        return {"processed": store.import_items(*current, body.items)}

    @router.get("/preparation", response_model=LibraryPreparation)
    def preparation(current: Current) -> LibraryPreparation:
        return store.preparation(*current)

    @router.get("/recommendations", response_model=RecommendationPage)
    def recommended(
        current: Current,
        response: Response,
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
        media_type: MediaType | None = None,
        strategy: Literal["genres", "text", "combined", "personalized"] = "combined",
        offset: Annotated[int, Query(ge=0, le=5000)] = 0,
    ) -> RecommendationPage:
        response.headers["Cache-Control"] = "private, no-store"
        library = store.preparation(*current)
        try:
            if strategy == "personalized":
                if personalized is None:
                    raise HTTPException(503, "As sugestões personalizadas estão indisponíveis.")
                return personalized.get(*current, library, limit, media_type, offset)
            return recommendations.get(library, limit, media_type, strategy)
        except (CatalogUnavailable, EmbeddingsUnavailable):
            raise HTTPException(
                503, "Não conseguimos preparar suas sugestões agora. Tente novamente."
            ) from None

    @router.put("/library/{slug}", response_model=MediaItem)
    def save(slug: Slug, body: SaveFavorite, current: Current) -> MediaItem:
        return store.save(*current, slug, body.item)

    @router.post("/library/completed", response_model=TasteResult)
    def complete_work(body: CompletedWork, current: Current) -> TasteResult:
        return store.complete_work(*current, body)

    @router.delete("/library/{slug}", status_code=204)
    def remove(slug: Slug, current: Current) -> Response:
        store.remove(*current, slug)
        return Response(status_code=204)

    @router.patch("/library/{slug}", response_model=LibraryFeedback)
    def update_library(slug: Slug, body: LibraryUpdate, current: Current) -> LibraryFeedback:
        return store.update_library(*current, slug, body)

    return router
