#!/usr/bin/env python3
"""Check or regenerate the source-package SHA-256 manifest from tracked files.

Git's index supplies the inventory; the working tree supplies the bytes. Stage
new files and removals before --write. Untracked backups and test outputs are
never discovered by a recursive directory walk.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile


MANIFEST = "SHA256SUMS.txt"
# These historical, branch-only validation transports were never shipped.
# Durable workflows, including validate.yml and publish-wiki.yml, ARE included.
TEMPORARY_WORKFLOW = re.compile(
    r"\.github/workflows/(?:e415-\d+|perf-\d+[a-z]?)-"
    r"(?:validation|evidence|prepare)\.ya?ml\Z"
)
ENTRY = re.compile(r"([0-9a-f]{64})  \./(.+)\Z")


class ManifestError(Exception):
    """An input cannot safely be represented by this source-package format."""


def excluded(name: str) -> bool:
    return name == MANIFEST or TEMPORARY_WORKFLOW.fullmatch(name) is not None


def valid_path(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        bool(name)
        and not path.is_absolute()
        and ".." not in path.parts
        and path.as_posix() == name
        and not any(char in name for char in "\\\r\n\0")
    )


def tracked_paths(root: Path) -> list[str]:
    try:
        top = subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
            stderr=subprocess.PIPE,
        ).decode("utf-8").strip()
        if Path(top).resolve() != root:
            raise ManifestError(f"--root must be the Git repository root: {top}")
        entries = subprocess.check_output(
            ["git", "-C", str(root), "ls-files", "--cached", "--stage", "-z"],
            stderr=subprocess.PIPE,
        ).decode("utf-8").split("\0")
    except FileNotFoundError as exc:
        raise ManifestError("Git is required to enumerate the tracked source files") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="replace").strip()
        raise ManifestError(f"cannot enumerate tracked files: {detail}") from exc
    except UnicodeDecodeError as exc:
        raise ManifestError("tracked paths must use UTF-8 for the text manifest") from exc

    names = []
    for entry in entries:
        if not entry:
            continue
        metadata, name = entry.split("\t", 1)
        mode, _object_id, stage = metadata.split()
        if stage != "0":
            raise ManifestError(f"unresolved Git conflict: {name!r}")
        if excluded(name):
            continue
        if not valid_path(name):
            raise ManifestError(f"path cannot be represented by this manifest: {name!r}")
        if mode not in {"100644", "100755"}:
            raise ManifestError(f"expected a regular tracked file, got mode {mode}: {name!r}")
        names.append(name)
    if not names:
        raise ManifestError("no tracked source files found")
    return sorted(names)


def source_hashes(root: Path) -> dict[str, str]:
    hashes = {}
    for name in tracked_paths(root):
        path = root / name
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ManifestError(f"tracked source is a symlink or leaves the repository: {name!r}")
        try:
            digest = hashlib.sha256()
            with path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            hashes[name] = digest.hexdigest()
        except FileNotFoundError as exc:
            raise ManifestError(
                f"tracked file is missing: {name!r}; restore it or stage its removal with git rm"
            ) from exc
        except OSError as exc:
            raise ManifestError(f"cannot read tracked source {name!r}: {exc}") from exc
    return hashes


def render(hashes: dict[str, str]) -> str:
    return "".join(f"{digest}  ./{name}\n" for name, digest in hashes.items())


def check_manifest(root: Path, expected: dict[str, str]) -> int:
    path = root / MANIFEST
    try:
        source = path.read_bytes().decode("utf-8")
    except FileNotFoundError:
        print(f"MISSING MANIFEST: {path}", file=sys.stderr)
        print("Stage intended source files, then run python tools/source_manifest.py --write", file=sys.stderr)
        return 1
    except (OSError, UnicodeDecodeError) as exc:
        raise ManifestError(f"cannot read {MANIFEST}: {exc}") from exc

    actual = {}
    problems = []
    for line_number, line in enumerate(source.splitlines(), 1):
        match = ENTRY.fullmatch(line)
        if not match or not valid_path(match.group(2)):
            problems.append(f"MALFORMED: {MANIFEST}:{line_number}: expected '<sha256>  ./<relative path>'")
            continue
        digest, name = match.groups()
        if name in actual:
            problems.append(f"DUPLICATE: {MANIFEST}:{line_number}: {name}")
        actual[name] = digest

    for name in sorted(expected.keys() - actual.keys()):
        problems.append(f"MISSING ENTRY: {name}")
    for name in sorted(actual.keys() - expected.keys()):
        problems.append(f"EXTRA ENTRY: {name} (not in the tracked source inventory)")
    for name in sorted(expected.keys() & actual.keys()):
        if actual[name] != expected[name]:
            problems.append(f"CHANGED: {name}\n  manifest: {actual[name]}\n  current:  {expected[name]}")
    if not problems and source != render(expected):
        problems.append("NONCANONICAL: entries must be path-sorted with LF line endings and a final newline")
    if problems:
        print(f"SOURCE MANIFEST FAILED: {len(problems)} problem(s)", file=sys.stderr)
        print("\n".join(problems), file=sys.stderr)
        print("Stage intended additions/removals, run python tools/source_manifest.py --write, and commit the result.", file=sys.stderr)
        return 1
    print(f"SOURCE MANIFEST PASS: {len(expected)} tracked files match {MANIFEST}")
    return 0


def write_manifest(root: Path, hashes: dict[str, str]) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", dir=root,
            prefix=".source-manifest-", suffix=".tmp", delete=False,
        ) as output:
            temporary = Path(output.name)
            output.write(render(hashes))
        os.replace(temporary, root / MANIFEST)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print(f"WROTE {MANIFEST}: {len(hashes)} tracked files")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="report missing, extra, changed or malformed entries")
    mode.add_argument("--write", action="store_true", help="replace SHA256SUMS.txt from the tracked working tree")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="repository root (default: this script's repository)")
    args = parser.parse_args()
    try:
        root = args.root.resolve()
        hashes = source_hashes(root)
        if args.check:
            return check_manifest(root, hashes)
        write_manifest(root, hashes)
        return 0
    except (ManifestError, OSError) as exc:
        print(f"SOURCE MANIFEST ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
