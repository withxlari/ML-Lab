import json
import argparse
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    "Google API key": rb"AIza[0-9A-Za-z_-]{35}",
    "GitHub token": rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})",
    "Secret API key": rb"(?:sb_secret_|sk-proj-)[A-Za-z0-9_-]{20,}",
    "Private key": rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "AWS key": rb"AKIA[0-9A-Z]{16}",
    "JWT credential": rb"eyJ[A-Za-z0-9_-]{16,}\.eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{10,}",
}


def git(*args: str, cwd: Path = ROOT) -> bytes:
    return subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.DEVNULL)


def local_secrets() -> list[tuple[str, bytes]]:
    result = []
    for name in ("backend/.env", "frontend/.env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip("\"'")
            if (
                any(
                    word in key
                    for word in ("SECRET", "TOKEN", "API_KEY", "DATABASE_URL")
                )
                and "PUBLISHABLE" not in key
                and len(value) > 12
            ):
                result.append((key.strip(), value.encode()))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, default=ROOT)
    args = parser.parse_args()
    repository = Path(git('rev-parse', '--show-toplevel', cwd=args.repository).decode().strip())
    secrets = local_secrets()
    findings = []
    files = set(
        git("ls-files", "-co", "--exclude-standard", "-z", cwd=repository).decode().split("\0")
    ) - {""}
    for name in sorted(files):
        path = repository / name
        if not path.is_file():
            continue
        if path.name == ".env" or (
            path.name.startswith(".env.") and not path.name.endswith(".example")
        ):
            findings.append({"file": name, "kind": "Environment file"})
        if any(
            part in {"node_modules", ".venv", ".runtime", ".cache", "dist"}
            for part in path.relative_to(repository).parts
        ):
            findings.append({"file": name, "kind": "Generated files included in Git"})
            continue
        if path.suffix.lower() in {".zip", ".pem", ".p12", ".key"}:
            findings.append({"file": name, "kind": "Archive or credential file"})
        if path.stat().st_size > 8_000_000:
            findings.append({"file": name, "kind": "Oversized file; review manually"})
            continue
        raw = path.read_bytes()
        for key, value in secrets:
            if value in raw:
                findings.append({"file": name, "kind": key})
        for label, pattern in PATTERNS.items():
            if re.search(pattern, raw):
                findings.append({"file": name, "kind": label})
    history = git("log", "--all", "--format=", "-p", cwd=repository)
    for key, value in secrets:
        if value in history:
            findings.append({"file": "Git history", "kind": key})
    for label, pattern in PATTERNS.items():
        if re.search(pattern, history):
            findings.append({"file": "Git history", "kind": label})
    print(
        json.dumps(
            {"files_checked": len(files), "history_checked": True, "findings": findings}
        )
    )
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
