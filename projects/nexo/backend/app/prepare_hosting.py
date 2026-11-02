import os

from app.runtime_paths import BACKEND_ROOT
from app.semantic import MODEL_NAME


def main() -> None:
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    from fastembed import TextEmbedding

    model = TextEmbedding(
        MODEL_NAME,
        cache_dir=str(BACKEND_ROOT / ".model"),
        threads=2,
        providers=["CPUExecutionProvider"],
    )
    next(iter(model.embed(["Nexo: filmes, séries, livros, mangás e jogos."])))
    print("Modelo de recomendações preparado para publicação.")


if __name__ == "__main__":
    main()
