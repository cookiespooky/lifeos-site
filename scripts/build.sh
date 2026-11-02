#!/usr/bin/env bash
# Пересборка сайта Life OS: выгрузка реестра компонентов из хранилища -> content/ и content-en/ -> dist/.
# Ничего не коммитит и не публикует: что изменилось, видно в `git diff data/components.json`.
#   scripts/build.sh            — из хранилища рядом (../life) или из LIFEOS_VAULT
#   scripts/build.sh --no-vault — собрать из уже лежащего data/components.json (так собирает и GitHub)
# Обе версии сразу: русская в корне dist/, английская (src/en/, config.en.yaml, rules.en.yaml) — в dist/en/.
# Публикует GitHub Pages: пуш в main собирает этот же скрипт (.github/workflows/pages.yml).
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
VAULT="${LIFEOS_VAULT:-$ROOT_DIR/../life}"
NO_VAULT=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-vault) NO_VAULT=1; shift ;;
    *) echo "неизвестный ключ: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$NO_VAULT" && -f "$VAULT/lifeos.yaml" ]] && command -v lifeos >/dev/null 2>&1; then
  echo "1/3 Реестр компонентов из $VAULT"
  LIFEOS_VAULT="$VAULT" lifeos component export "$ROOT_DIR/data"
else
  echo "1/3 Реестр не выгружался: беру data/components.json как есть"
fi

echo "2/3 Страницы"
python3 scripts/gen.py --check --lang ru && python3 scripts/gen.py --check --lang en   # обе проверки до первой записи
python3 scripts/gen.py --lang ru
python3 scripts/gen.py --lang en

NOTEPUB_REF="${NOTEPUB_REF:-8ef36a58c94dca5bd7f3f696c05a9201cd140d47}"   # v0.1.10, тот же, что у site/ (с 23.10; v0.1.9 — связь языков, alternates)
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
build() {  # build <config> <rules> <dist> <state>
  rm -rf "$3" "$4"; mkdir -p "$3"
  "$NOTEPUB_BIN" validate --config "$1" --rules "$2"
  "$NOTEPUB_BIN" index --config "$1" --rules "$2"
  "$NOTEPUB_BIN" validate --config "$1" --rules "$2" --resolve "./$4/artifacts/resolve.json" --links --markdown
  "$NOTEPUB_BIN" build --config "$1" --rules "$2" --dist "./$3" --artifacts "./$4/artifacts"
  cp -R static/. "$3/"                      # значок и картинка для соцсетей: scripts/brand.py
  python3 scripts/llms.py "$3"
}
build ./config.yaml ./rules.yaml dist .notepub
build ./config.en.yaml ./rules.en.yaml dist-en .notepub-en
rm -rf dist/en && mv dist-en dist/en
# онлайн-демо на сайте не показываем (Антон, 2.11): demo-app/ в сборку не идёт, страница — в src/drafts/demo.md
touch dist/.nojekyll
# адрес сайта для GitHub Pages — из base_url, чтобы не держать его в двух местах
python3 -c "import re,urllib.parse as u;print(u.urlparse(re.search(r'base_url: \"([^\"]+)\"',open('config.yaml').read()).group(1)).hostname)" > dist/CNAME
grep -q 'en/sitemap' dist/robots.txt || sed "s#/sitemap-index.xml#/en/sitemap-index.xml#" dist/robots.txt | grep '^Sitemap:' >> dist/robots.txt
echo "Готово: $ROOT_DIR/dist (английская — dist/en/) — не закоммичено и не опубликовано"
