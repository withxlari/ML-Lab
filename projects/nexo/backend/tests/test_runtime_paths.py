import runpy
import tempfile
from pathlib import Path

import pytest


def test_vercel_writes_cache_to_temporary_storage_but_loads_bundled_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VERCEL", "1")
    paths = runpy.run_path(str(Path(__file__).parents[1] / "app/runtime_paths.py"))
    assert paths["CACHE_ROOT"] == Path(tempfile.gettempdir()) / "nexo"
    assert paths["MODEL_ROOT"] == Path(__file__).parents[1] / ".model"


def test_local_cache_and_model_paths_remain_compatible(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    paths = runpy.run_path(str(Path(__file__).parents[1] / "app/runtime_paths.py"))
    assert paths["CACHE_ROOT"] == Path(__file__).parents[2] / ".cache"
    assert paths["MODEL_ROOT"] == paths["CACHE_ROOT"] / "models"
