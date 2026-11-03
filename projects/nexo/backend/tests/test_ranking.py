from pathlib import Path
from typing import Any
from unittest.mock import patch

from app.catalog import Catalog, CatalogPage, MediaItem
from app.core.config import Settings
from app.metadata_cache import MetadataCache
from app.ranking import collapse_editions, edition_key, rank, relevance
from app.search import FederatedSearch, make_item

COUNTER = iter(range(10_000))


def book(title: str, author: str = "Autor", **values: Any) -> MediaItem:
    n = next(COUNTER)
    return make_item(
        "google_books",
        "volume",
        f"V{n}",
        title=title,
        media_type="book",
        creators=[author] if author else [],
        source_url=f"https://books.google.com/books?id=V{n}",
        **values,
    )


def test_relevance_tiers() -> None:
    assert relevance(book("O Príncipe Cruel"), "o principe cruel") == 0
    assert relevance(book("O Príncipe Cruel"), "o princ") == 1
    assert relevance(book("O Príncipe Cruel"), "cruel principe") == 2
    assert relevance(book("O Príncipe Cruel", "Holly Black"), "principe black") == 3
    assert relevance(book("Outro livro"), "principe") == 4


def test_leading_articles_are_ignored() -> None:
    assert relevance(book("O Principe", "Maquiavel"), "principe") == 0
    assert relevance(book("El Príncipe de la Niebla"), "principe") == 1
    assert relevance(book("The Prince"), "the prince") == 0
    assert relevance(book("A"), "a") == 0  # a one-word title is not stripped


def test_unknown_language_sits_between_portuguese_and_other_languages() -> None:
    english = book("Príncipe", "X", language="en")
    unknown = book("Príncipe", "Y")
    portuguese = book("Príncipe", "Z", language="pt")
    assert rank([english, unknown, portuguese], "principe") == [portuguese, unknown, english]


def test_portuguese_and_covers_win_ties_and_the_catalog_gets_no_head_start() -> None:
    stored_report = book("São Tomé and Príncipe", "IMF", language="en")  # came from the catalog
    portuguese = book("O Príncipe Cruel", "Holly Black", language="pt-BR", poster_path=None)
    with_cover = book(
        "O Pequeno Príncipe",
        "Saint-Exupéry",
        language="pt",
        poster_path="https://covers.openlibrary.org/b/id/1-L.jpg?default=false",
    )
    ordered = rank([stored_report, portuguese, with_cover], "principe")
    # "O Príncipe Cruel" starts with the term once the article is ignored (tier 1); the
    # other two only contain it (tier 2), where Portuguese with a cover beats the report.
    assert [item.title for item in ordered] == [
        "O Príncipe Cruel",
        "O Pequeno Príncipe",
        "São Tomé and Príncipe",
    ]


def test_better_match_beats_portuguese_preference() -> None:
    exact_english = book("Dune", "Frank Herbert", language="en")
    loose_portuguese = book("Dune: a saga", "Outro", language="pt")
    assert rank([loose_portuguese, exact_english], "dune")[0] is exact_english


def test_editions_of_one_book_collapse_to_the_most_complete() -> None:
    plain = book("Democratic Republic of São Tomé and Príncipe", "International Monetary Fund.")
    better = book(
        "Democratic Republic of São Tomé and Príncipe",
        "International Monetary Fund",
        description="Relatório",
        isbn_13="9781484347140",
    )
    other = book("O Príncipe Cruel", "Holly Black")
    assert collapse_editions([plain, other, better]) == [better, other]


def test_same_title_by_different_authors_is_not_collapsed() -> None:
    a = book("Duna", "Frank Herbert")
    b = book("Duna", "Outra Pessoa")
    assert collapse_editions([a, b]) == [a, b]


def test_editorial_rows_and_books_without_author_are_kept() -> None:
    editorial = book("Duna", "Frank Herbert", editorial_note="Escolha da equipe")
    runtime = book(
        "Duna",
        "Frank Herbert",
        language="pt",
        description="x",
        poster_path="https://covers.openlibrary.org/b/id/1-L.jpg?default=false",
    )
    assert collapse_editions([runtime, editorial]) == [editorial]
    assert edition_key(book("Sem autor", "")) is None


def test_search_ranks_catalog_and_sources_together_and_collapses_editions(
    tmp_path: Path,
) -> None:
    config = Settings(_env_file=None, catalog_source="local")
    search = FederatedSearch(config, Catalog(config), MetadataCache(tmp_path / "c.sqlite3"))
    junk = book("São Tomé and Príncipe", "IMF", language="en")
    junk_again = book("São Tomé and Príncipe", "IMF", language="en")
    wanted = book("O Príncipe Cruel", "Holly Black", language="pt-BR")
    catalog_page = CatalogPage(items=[junk, junk_again], total=2, limit=12, offset=0)
    with (
        patch.object(search, "books", return_value=([wanted], False)),
        patch.object(search.catalog, "search", return_value=catalog_page),
        patch.object(search.catalog, "canonical_items", return_value=[]),
    ):
        page = search.search("principe", "book", 1)
    assert [item.title for item in page.items] == ["O Príncipe Cruel", "São Tomé and Príncipe"]


def test_only_useful_search_results_are_stored(tmp_path: Path) -> None:
    config = Settings(_env_file=None, catalog_source="local")
    search = FederatedSearch(config, Catalog(config), MetadataCache(tmp_path / "c.sqlite3"))
    portuguese = book("O Príncipe Cruel", "Holly Black", language="pt-BR")
    unknown_language = book("Dom Casmurro", "Machado de Assis")  # Open Library: no language
    english = book("São Tomé and Príncipe", "IMF", language="en")
    with patch.object(search, "store_books") as store:
        search.store_search_results("pr", [portuguese])
        store.assert_not_called()
        search.store_search_results("principe", [portuguese, unknown_language, english])
    store.assert_called_once_with([portuguese, unknown_language])
