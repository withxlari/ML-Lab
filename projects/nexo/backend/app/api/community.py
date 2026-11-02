from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.account import AccountStore, AccountUser
from app.community import (
    ActivityPage,
    CommunityStore,
    Feedback,
    FeedbackUpdate,
    PublicProfile,
    PublicProfileUpdate,
    Review,
    ReviewUpdate,
    TastePreferences,
)
from app.people import FollowingPage, FollowStatus, PeoplePage, PeopleStore, PublicConnections


def create_community_router(account: AccountStore) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["profiles and tastes"])
    store = CommunityStore(account)
    people = PeopleStore(account)
    bearer = HTTPBearer(auto_error=False)

    def authenticate(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> tuple[AccountUser, str]:
        if credentials is None or not credentials.credentials.strip():
            raise HTTPException(401, "Entre na sua conta para continuar.")
        return account.user(credentials.credentials), credentials.credentials

    Current = Annotated[tuple[AccountUser, str], Depends(authenticate)]
    Slug = Annotated[str, Path(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)]
    Username = Annotated[str, Path(pattern=r"^[a-z0-9][a-z0-9_-]{2,29}$")]

    @router.get("/people/search", response_model=PublicConnections)
    def search_profiles(
        response: Response,
        q: Annotated[str, Query(min_length=2, max_length=80)],
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
        offset: Annotated[int, Query(ge=0, le=5000)] = 0,
    ) -> PublicConnections:
        response.headers["Cache-Control"] = "no-store"
        term = q.strip().lstrip("@").strip()
        if len(term) < 2:
            raise HTTPException(422, "Digite pelo menos dois caracteres.")
        return people.search_profiles(term, limit, offset)

    @router.get("/me/people", response_model=PeoplePage)
    def recommended_people(
        current: Current,
        response: Response,
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
        offset: Annotated[int, Query(ge=0, le=5000)] = 0,
    ) -> PeoplePage:
        response.headers["Cache-Control"] = "private, no-store"
        return people.suggestions(*current, limit, offset)

    @router.get("/me/following", response_model=FollowingPage)
    def following(
        current: Current,
        response: Response,
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> FollowingPage:
        response.headers["Cache-Control"] = "private, no-store"
        return people.following(*current, limit, offset)

    @router.get("/me/following/status/{username}", response_model=FollowStatus)
    def follow_status(username: Username, current: Current, response: Response) -> FollowStatus:
        response.headers["Cache-Control"] = "private, no-store"
        return people.status(*current, username)

    @router.put("/me/following/{username}", response_model=FollowStatus)
    def follow(username: Username, current: Current) -> FollowStatus:
        return people.follow(*current, username)

    @router.delete("/me/following/{target}", status_code=204)
    def unfollow(target: UUID, current: Current) -> Response:
        people.unfollow(*current, target)
        return Response(status_code=204)

    @router.get("/me/preferences", response_model=TastePreferences)
    def preferences(current: Current, response: Response) -> TastePreferences:
        response.headers["Cache-Control"] = "private, no-store"
        return store.preferences(*current)

    @router.put("/me/preferences", response_model=TastePreferences)
    def save_preferences(body: TastePreferences, current: Current) -> TastePreferences:
        return store.save_preferences(*current, body)

    @router.get("/me/public-profile", response_model=PublicProfile | None)
    def own_profile(current: Current, response: Response) -> PublicProfile | None:
        response.headers["Cache-Control"] = "private, no-store"
        return store.own_profile(*current)

    @router.put("/me/public-profile", response_model=PublicProfile)
    def save_profile(body: PublicProfileUpdate, current: Current) -> PublicProfile:
        return store.save_profile(*current, body)

    @router.get("/profiles/{username}", response_model=PublicProfile)
    def public_profile(username: Username, response: Response) -> PublicProfile:
        response.headers["Cache-Control"] = "no-store"
        return store.public_profile(username)

    @router.get("/profiles/{username}/activity", response_model=ActivityPage)
    def activity(
        username: Username,
        response: Response,
        kind: Literal["all", "reviews", "ratings"] = "all",
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
        offset: Annotated[int, Query(ge=0, le=10000)] = 0,
    ) -> ActivityPage:
        response.headers["Cache-Control"] = "no-store"
        return store.activity(username, limit, offset, kind)

    @router.get("/profiles/{username}/connections", response_model=PublicConnections)
    def public_connections(
        username: Username,
        direction: Literal["followers", "following"],
        response: Response,
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
        offset: Annotated[int, Query(ge=0, le=10000)] = 0,
    ) -> PublicConnections:
        response.headers["Cache-Control"] = "no-store"
        return people.public_connections(username, direction, limit, offset)

    @router.get("/me/reviews", response_model=list[Review])
    def reviews(current: Current, response: Response) -> list[Review]:
        response.headers["Cache-Control"] = "private, no-store"
        return store.reviews(*current)

    @router.get("/me/reviews/{slug}", response_model=Review | None)
    def review(slug: Slug, current: Current, response: Response) -> Review | None:
        response.headers["Cache-Control"] = "private, no-store"
        return store.review(*current, slug)

    @router.put("/me/reviews/{slug}", response_model=Review)
    def save_review(slug: Slug, body: ReviewUpdate, current: Current) -> Review:
        return store.save_review(*current, slug, body)

    @router.delete("/me/reviews/{slug}", status_code=204)
    def delete_review(slug: Slug, current: Current) -> Response:
        store.delete_review(*current, slug)
        return Response(status_code=204)

    @router.get("/me/recommendation-feedback", response_model=list[Feedback])
    def feedback(current: Current, response: Response) -> list[Feedback]:
        response.headers["Cache-Control"] = "private, no-store"
        return store.feedback(*current)

    @router.put("/me/recommendation-feedback/{slug}", response_model=Feedback)
    def save_feedback(slug: Slug, body: FeedbackUpdate, current: Current) -> Feedback:
        return store.save_feedback(*current, slug, body)

    @router.delete("/me/recommendation-feedback/{slug}", status_code=204)
    def delete_feedback(slug: Slug, current: Current) -> Response:
        store.delete_feedback(*current, slug)
        return Response(status_code=204)

    return router
