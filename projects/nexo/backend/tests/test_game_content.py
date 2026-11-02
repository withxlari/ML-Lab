from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.catalog import Catalog
from app.core.config import Settings
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch


def search(tmp_path: Path) -> FederatedSearch:
    config = Settings(_env_file=None, catalog_source="local")
    return FederatedSearch(config, Catalog(config), MetadataCache(tmp_path / "public.sqlite3"))


@pytest.mark.parametrize(
    "metadata",
    [
        {"age_ratings": [{"rating_category": {"rating": "18+"}}]},
        {"age_ratings": [{"rating_category": {"rating": "Adults Only"}}]},
        {"themes": [{"name": "Erotic"}]},
        {"keywords": [{"name": "NSFW"}]},
        {"name": "Femboy Futa House"},
    ],
)
def test_mature_game_metadata_protects_the_cover(tmp_path: Path, metadata: dict[str, Any]) -> None:
    raw = {"id": 1, "name": "Game", "slug": "game", "cover": {"image_id": "co123"}, **metadata}
    item = search(tmp_path)._game_item(raw)
    assert item.is_adult is True
    assert item.age_rating == "18+"


def test_nonsexual_identity_and_ordinary_genres_are_not_treated_as_adult(tmp_path: Path) -> None:
    item = search(tmp_path)._game_item(
        {
            "id": 2,
            "name": "Femboy Fashion",
            "slug": "fashion",
            "genres": [{"name": "Role-playing (RPG)"}],
            "age_ratings": [{"rating_category": {"rating": "12"}}],
        }
    )
    assert item.is_adult is False


def test_game_screenshots_have_their_own_approved_landscape_url(tmp_path: Path) -> None:
    item = search(tmp_path)._game_item(
        {"id": 3, "name": "Game", "slug": "game", "screenshots": [{"image_id": "sc123"}]}
    )
    assert (
        item.backdrop_path == "https://images.igdb.com/igdb/image/upload/t_screenshot_big/sc123.jpg"
    )
    with pytest.raises(ValidationError):
        type(item).model_validate(
            {**item.model_dump(), "backdrop_path": "https://evil.invalid/image.jpg"}
        )
    legacy = type(item).model_validate(
        {**item.model_dump(), "title": "Femboy Futa House", "is_adult": False}
    )
    assert legacy.is_adult is True
