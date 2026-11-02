from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

from app.runtime_paths import CACHE_ROOT, MODEL_ROOT

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class EmbeddingsUnavailable(Exception):
    pass


def normalized(values: list[float]) -> list[float]:
    length = math.sqrt(sum(x * x for x in values))
    if not length or not math.isfinite(length):
        raise EmbeddingsUnavailable("Invalid embedding")
    return [x / length for x in values]


def cosine(left: list[float], right: list[float]) -> float:
    return max(0.0, min(1.0, sum(a * b for a, b in zip(left, right, strict=True))))


def chunks(text: str) -> list[str]:

    result: list[str] = []
    current = ""
    for word in text.split():
        for start in range(0, len(word), 240):
            part = word[start : start + 240]
            if len(current) + len(part) + 1 > 240:
                result.append(current)
                current = ""
            current = (current + " " + part).strip()
    if current:
        result.append(current)
    return result or ["obra"]


class LocalEmbeddings:
    def __init__(self, root: Path = CACHE_ROOT) -> None:
        self.root = root
        self.lock = threading.Lock()
        self.model: Any = None
        self.private: OrderedDict[tuple[str, str], tuple[float, list[float]]] = OrderedDict()

    def encode(self, texts: list[str], owner: str | None = None) -> list[list[float]]:
        if not texts:
            return []
        with self.lock:
            folder = self.root / "semantic"
            folder.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(folder / "public-vectors.sqlite3") as db:
                db.execute(
                    "create table if not exists vectors (key text primary key, value text not null)"
                )
                keys = [
                    hashlib.sha256((MODEL_NAME + "\nchunks-v1\n" + text).encode()).hexdigest()
                    for text in texts
                ]
                result: dict[int, list[float]] = {}
                missing: list[int] = []
                for i, key in enumerate(keys):
                    if owner is None:
                        row = db.execute("select value from vectors where key=?", (key,)).fetchone()
                        if row:
                            result[i] = [float(x) for x in json.loads(row[0])]
                    else:
                        hit = self.private.get((owner, key))
                        if hit and hit[0] > time.monotonic():
                            result[i] = hit[1]
                            self.private.move_to_end((owner, key))
                    if i not in result:
                        missing.append(i)
                if missing:
                    if self.model is None:
                        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
                        os.environ["HF_HUB_DISABLE_XET"] = "1"
                        from fastembed import TextEmbedding

                        try:
                            self.model = TextEmbedding(
                                MODEL_NAME,
                                cache_dir=str(
                                    MODEL_ROOT if self.root == CACHE_ROOT else self.root / "models"
                                ),
                                threads=2,
                                providers=["CPUExecutionProvider"],
                                local_files_only=True,
                            )
                        except Exception as exc:
                            raise EmbeddingsUnavailable(
                                "O modelo local não está disponível."
                            ) from exc
                    pieces = [chunks(texts[i]) for i in missing]
                    try:
                        vectors = list(
                            self.model.embed(
                                [chunk for group in pieces for chunk in group], batch_size=32
                            )
                        )
                        cursor = 0
                        for i, group in zip(missing, pieces, strict=True):
                            rows = [
                                normalized([float(x) for x in row])
                                for row in vectors[cursor : cursor + len(group)]
                            ]
                            cursor += len(group)
                            value = normalized(
                                [sum(row[d] for row in rows) / len(rows) for d in range(384)]
                            )
                            result[i] = value
                            if owner is None:
                                db.execute(
                                    "insert or replace into vectors values (?,?)",
                                    (keys[i], json.dumps(value)),
                                )
                            else:
                                self.private[(owner, keys[i])] = (time.monotonic() + 180, value)
                    except EmbeddingsUnavailable:
                        raise
                    except Exception as exc:
                        raise EmbeddingsUnavailable(
                            "Não foi possível representar estes textos."
                        ) from exc
                while len(self.private) > 512:
                    self.private.popitem(last=False)
                return [result[i] for i in range(len(texts))]


if __name__ == "__main__":
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    from fastembed import TextEmbedding

    TextEmbedding(
        MODEL_NAME,
        cache_dir=str(CACHE_ROOT / "models"),
        threads=2,
        providers=["CPUExecutionProvider"],
    )
    print("Modelo multilíngue disponível no cache local.")
