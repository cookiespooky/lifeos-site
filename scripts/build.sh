#!/usr/bin/env bash
# Пересборка сайта Life OS: выгрузка реестра компонентов из хранилища -> content/ -> dist/.
# Ничего не коммитит и не публикует: что изменилось, видно в `git diff data/components.json`.
#   scripts/build.sh            — из хранилища рядом (../life) или из LIFEOS_VAULT
#   scripts/build.sh --no-vault — собрать из уже лежащего data/components.json (так собирает и GitHub)
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
VAULT="${LIFEOS_VAULT:-$ROOT_DIR/../life}"

if [[ "${1:-}" != "--no-vault" && -f "$VAULT/lifeos.yaml" ]] && command -v lifeos >/dev/null 2>&1; then
  echo "1/3 Реестр компонентов из $VAULT"
  LIFEOS_VAULT="$VAULT" lifeos component export "$ROOT_DIR/data"
else
  echo "1/3 Реестр не выгружался: беру data/components.json как есть"
fi

echo "2/3 Страницы"
python3 scripts/gen.py

NOTEPUB_REF="${NOTEPUB_REF:-864920de7068737d5e95bc15b0e45dc1c3436da3}"   # тот же, что у site/
NOTEPUB_BIN="${NOTEPUB_BIN:-}"
if [[ -z "$NOTEPUB_BIN" ]]; then
  if [[ -x "$ROOT_DIR/.bin/notepub" ]]; then NOTEPUB_BIN="$ROOT_DIR/.bin/notepub"
  elif [[ -x "$ROOT_DIR/../site/.bin/notepub" ]]; then NOTEPUB_BIN="$ROOT_DIR/../site/.bin/notepub"
  elif command -v notepub >/dev/null 2>&1; then NOTEPUB_BIN="$(command -v notepub)"
  else
    command -v go >/dev/null 2>&1 || { echo "Ошибка: не найден notepub и не установлен Go." >&2; exit 1; }
    mkdir -p "$ROOT_DIR/.bin"
    GOBIN="$ROOT_DIR/.bin" go install "github.com/cookiespooky/notepub/cmd/notepub@${NOTEPUB_REF}"
    NOTEPUB_BIN="$ROOT_DIR/.bin/notepub"
  fi
fi

echo "3/3 Сайт"
rm -rf dist .notepub
mkdir -p dist
"$NOTEPUB_BIN" validate --config ./config.yaml --rules ./rules.yaml
"$NOTEPUB_BIN" index --config ./config.yaml --rules ./rules.yaml
"$NOTEPUB_BIN" validate --config ./config.yaml --rules ./rules.yaml --resolve ./.notepub/artifacts/resolve.json --links --markdown
"$NOTEPUB_BIN" build --config ./config.yaml --rules ./rules.yaml --dist ./dist --artifacts ./.notepub/artifacts
touch dist/.nojekyll
echo "Готово: $ROOT_DIR/dist — не закоммичено и не опубликовано"
