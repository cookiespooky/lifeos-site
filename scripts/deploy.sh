#!/usr/bin/env bash
# Выкладка сайта Life OS на сервер: собрать и положить dist/ в /srv/lifeos-site под nginx.
#
#   scripts/deploy.sh             — собрать из хранилища рядом и выложить
#   scripts/deploy.sh --no-vault  — собрать из уже лежащего data/components.json и выложить
#   scripts/deploy.sh --pervyy    — то же плюс каталог, сайт nginx и сертификат (один раз)
#
# До --pervyy: A-запись $DOMAIN → 45.90.33.166, иначе certbot не выпустит сертификат.
# Выкладывается рабочая папка, а не коммит — как у остальных служб на этом сервере.
set -Eeuo pipefail

HOST=${HOST:-root@45.90.33.166}
KEY=${KEY:-$HOME/.ssh/hookapp_server}
DOMAIN=${DOMAIN:-lifeos.antonlozhkin.ru}
DIR=/srv/lifeos-site
SITE=lifeos-site
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Одно соединение на всю выкладку: у сервера fail2ban, и десяток подключений подряд он считает за подбор.
SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o ControlMaster=auto -o ControlPath=/tmp/lifeos-site-ssh -o ControlPersist=5m)
SSH=(ssh "${SSH_OPTS[@]}")

PERVYY=0
BUILD_ARGS=()
for a in "$@"; do
  case "$a" in
    --pervyy) PERVYY=1 ;;
    --no-vault) BUILD_ARGS+=(--no-vault) ;;
    *) echo "неизвестный флаг: $a" >&2; exit 2 ;;
  esac
done

echo "Сборка перед выкладкой"
"$ROOT/scripts/build.sh" ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}
[[ -f "$ROOT/dist/index.html" ]] || { echo "нет dist/index.html — сборка не удалась" >&2; exit 1; }
# Сайт собран под адрес из config.yaml: с другим доменом все ссылки уведут не туда.
grep -q "base_url: \"https://$DOMAIN/\"" "$ROOT/config.yaml" || { echo "base_url в config.yaml — не https://$DOMAIN/" >&2; exit 1; }

# В каталоге на сервере нет ничего, кроме dist/, поэтому --delete: убранная страница уходит и с сайта.
"${SSH[@]}" "$HOST" "mkdir -p $DIR"
echo "Выкладываю → $HOST:$DIR ($DOMAIN)"
rsync -az --delete --exclude '.DS_Store' --exclude '.nojekyll' -e "ssh ${SSH_OPTS[*]}" "$ROOT/dist/" "$HOST:$DIR/"
"${SSH[@]}" "$HOST" "chown -R root:root $DIR && chmod -R a+rX $DIR"

if (( PERVYY )); then
  echo "Первая установка: сайт nginx и сертификат"
  # Сайт nginx копируется только если его ещё нет: certbot дописывает строки ssl_certificate прямо в этот файл,
  # и повторная выкладка поверх сносит их («Выбор», 2026-09-23).
  if "${SSH[@]}" "$HOST" "[ -f /etc/nginx/sites-available/$SITE ]"; then
    echo "сайт nginx уже есть — не трогаю (в нём строки certbot)"
  else
    # Блок 443 без сертификата nginx не примет: сначала только блок 80, блок 443 дописывается перед certbot.
    sed "s/__DOMAIN__/$DOMAIN/g" "$ROOT/deploy/$SITE.nginx" | "${SSH[@]}" "$HOST" "cat > /etc/nginx/sites-available/$SITE.full"
    "${SSH[@]}" "$HOST" bash -s <<REMOTE
set -Eeuo pipefail
cd /etc/nginx/sites-available
# первый блок server (до первой пустой строки) — http
awk 'BEGIN{RS=""} NR==1' $SITE.full > $SITE
ln -sf /etc/nginx/sites-available/$SITE /etc/nginx/sites-enabled/$SITE
nginx -t && systemctl reload nginx
certbot certonly --nginx -d $DOMAIN -n
cp $SITE.full $SITE && rm $SITE.full
certbot install --nginx --cert-name $DOMAIN -d $DOMAIN --redirect -n
nginx -t && systemctl reload nginx
REMOTE
  fi
fi

echo "Проверка"
curl -sS -m 15 -o /dev/null -w "главная:   %{http_code}\n" "https://$DOMAIN/"
curl -sS -m 15 -o /dev/null -w "стили:     %{http_code}\n" "https://$DOMAIN/assets/styles.css"
curl -sS -m 15 -o /dev/null -w "раздел:    %{http_code}\n" "https://$DOMAIN/chto-vnutri/"
curl -sS -m 15 -o /dev/null -w "нет такой: %{http_code}\n" "https://$DOMAIN/net-takoy-stranicy/"
curl -sS -m 15 -o /dev/null -w "http:      %{http_code} → %{redirect_url}\n" "http://$DOMAIN/"
echo "Готово: https://$DOMAIN/"
