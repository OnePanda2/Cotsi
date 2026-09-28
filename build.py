#!/usr/bin/env python3
"""Validate skills/cotsi and package it as "cotsi <version>.skill" in the repo root.

Usage:  python3 build.py

The version comes from `metadata.version` in skills/cotsi/SKILL.md. The evals/ folder is
left out of the package. Upload the resulting .skill file in Claude's Skills settings.
"""

import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKILL_DIR = ROOT / "skills" / "cotsi"
ALLOWED_KEYS = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}
EXCLUDED_DIRS = {"evals", "__pycache__", "node_modules"}
EXCLUDED_FILES = {".DS_Store"}
MAX_DESCRIPTION = 1024  # hard limit for skill descriptions
MAX_BODY_LINES = 500  # Anthropic's recommended ceiling for a SKILL.md body


def parse_frontmatter(text):
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        sys.exit("error: SKILL.md has no YAML frontmatter")
    try:
        import yaml
    except ImportError:
        sys.exit("error: PyYAML is required (pip install pyyaml)")
    frontmatter = yaml.safe_load(match.group(1))
    if not isinstance(frontmatter, dict):
        sys.exit("error: frontmatter must be a YAML mapping")
    return frontmatter, text[match.end():]


def validate(frontmatter, body):
    errors = []
    unexpected = set(frontmatter) - ALLOWED_KEYS
    if unexpected:
        errors.append(f"unexpected frontmatter keys: {', '.join(sorted(unexpected))}")

    name = str(frontmatter.get("name", "")).strip()
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name) or len(name) > 64:
        errors.append(f"name {name!r} must be kebab-case and at most 64 characters")
    if name != SKILL_DIR.name:
        errors.append(f"name {name!r} must match the folder name {SKILL_DIR.name!r}")

    description = str(frontmatter.get("description", "")).strip()
    if not description:
        errors.append("description is missing")
    if len(description) > MAX_DESCRIPTION:
        errors.append(f"description is {len(description)} characters (max {MAX_DESCRIPTION})")
    if "<" in description or ">" in description:
        errors.append("description cannot contain angle brackets")

    version = str((frontmatter.get("metadata") or {}).get("version", "")).strip()
    if not re.fullmatch(r"\d+(\.\d+)*", version):
        errors.append("metadata.version must look like 6.0")

    for ref in sorted(set(re.findall(r"references/[\w.-]+\.md", body))):
        if not (SKILL_DIR / ref).is_file():
            errors.append(f"SKILL.md points to a missing file: {ref}")

    body_lines = body.count("\n")
    if body_lines > MAX_BODY_LINES:
        print(f"warning: SKILL.md body is {body_lines} lines (aim for under {MAX_BODY_LINES})")

    if errors:
        sys.exit("error: " + "\nerror: ".join(errors))
    return name, version, len(description), body_lines


def package(name, version):
    output = ROOT / f"{name} {version}.skill"
    files = []
    for path in sorted(SKILL_DIR.rglob("*")):
        rel = path.relative_to(SKILL_DIR)
        if not path.is_file() or path.name in EXCLUDED_FILES:
            continue
        if rel.parts[0] in EXCLUDED_DIRS or any(p in {"__pycache__", "node_modules"} for p in rel.parts):
            continue
        files.append(path)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, Path(name) / path.relative_to(SKILL_DIR))
    return output, files


def main():
    text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    frontmatter, body = parse_frontmatter(text)
    name, version, description_chars, body_lines = validate(frontmatter, body)
    output, files = package(name, version)
    print(f"valid: {name} {version} (description {description_chars}/{MAX_DESCRIPTION} chars, "
          f"body {body_lines} lines)")
    for path in files:
        print(f"  + {name}/{path.relative_to(SKILL_DIR).as_posix()}")
    print(f"packaged: {output.name}")


if __name__ == "__main__":
    main()
