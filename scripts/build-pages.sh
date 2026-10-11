#!/bin/bash
set -euo pipefail

SRC_DIR="${1:-.}"
OUT_DIR="${2:-_site}"

command -v rsync >/dev/null 2>&1 || {
  echo "Missing required binary: rsync" >&2
  exit 1
}

mkdir -p "$OUT_DIR"

rsync -a --delete \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude '_site/' \
  --exclude 'output/' \
  --exclude 'scripts/' \
  --exclude 'tests/' \
  --exclude 'package.json' \
  --exclude 'assets/sprites/SOURCES.json' \
  --exclude '.gitignore' \
  --exclude 'README.md' \
  --exclude 'CLAUDE.md' \
  --exclude '.DS_Store' \
  "$SRC_DIR"/ "$OUT_DIR"/
