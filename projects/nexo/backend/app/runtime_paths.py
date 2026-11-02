import os
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ON_VERCEL = os.environ.get("VERCEL") == "1"
CACHE_ROOT = Path(tempfile.gettempdir()) / "nexo" if ON_VERCEL else BACKEND_ROOT.parent / ".cache"
MODEL_ROOT = BACKEND_ROOT / ".model" if ON_VERCEL else CACHE_ROOT / "models"
