#!/usr/bin/env bash
# Посмотреть сайт у себя: собрать обе версии с локальными адресами в dist-dev/ и открыть на http://127.0.0.1:8085/
# (английская — http://127.0.0.1:8085/en/).
#   scripts/preview.sh [--build-only]
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
BUILD_ONLY=; PORT=8085
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only) BUILD_ONLY=1; shift ;;
    *) echo "неизвестный ключ: $1" >&2; exit 2 ;;
  esac
done
python3 scripts/gen.py --lang ru
python3 scripts/gen.py --lang en
BIN="${NOTEPUB_BIN:-}"; [[ -n "$BIN" ]] || { [[ -x .bin/notepub ]] && BIN=.bin/notepub || BIN=../site/.bin/notepub; }
build() {  # build <config> <rules> <dist> <state>
  rm -rf "$3" "$4"
  "$BIN" index --config "$1" --rules "$2"
  "$BIN" build --config "$1" --rules "$2" --dist "./$3" --artifacts "./$4/artifacts"
  cp -R static/. "$3/"
  python3 scripts/llms.py "$3"
}
build ./config.dev.yaml ./rules.yaml dist-dev .notepub
build ./config.en.dev.yaml ./rules.en.yaml dist-en-dev .notepub-en
rm -rf dist-dev/en && mv dist-en-dev dist-dev/en
echo "http://127.0.0.1:$PORT/ и http://127.0.0.1:$PORT/en/ — Ctrl+C, чтобы остановить"
[[ -n "$BUILD_ONLY" ]] || python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist-dev
