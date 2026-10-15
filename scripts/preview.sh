#!/usr/bin/env bash
# Посмотреть сайт у себя: собрать с локальными адресами в dist-dev/ и открыть на http://127.0.0.1:8085/
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
python3 scripts/gen.py
BIN="${NOTEPUB_BIN:-}"; [[ -n "$BIN" ]] || { [[ -x .bin/notepub ]] && BIN=.bin/notepub || BIN=../site/.bin/notepub; }
rm -rf dist-dev .notepub
"$BIN" index --config ./config.dev.yaml --rules ./rules.yaml
"$BIN" build --config ./config.dev.yaml --rules ./rules.yaml --dist ./dist-dev --artifacts ./.notepub/artifacts
cp -R static/. dist-dev/
python3 scripts/llms.py dist-dev
echo "http://127.0.0.1:8085/ — Ctrl+C, чтобы остановить"
[[ "${1:-}" == "--build-only" ]] || python3 -m http.server 8085 --bind 127.0.0.1 --directory dist-dev
