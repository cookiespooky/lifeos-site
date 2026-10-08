#!/usr/bin/env bash
# Ставит в хранилище (../life или LIFEOS_VAULT) обработчик post-commit: после каждого коммита там сайт пересобирается сам.
# Обработчик ничего не коммитит и не публикует; журнал сборки — в .git/lifeos-site-build.log хранилища.
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="$(cd "${LIFEOS_VAULT:-$ROOT_DIR/../life}" && pwd)"
HOOK="$VAULT/.git/hooks/post-commit"
[[ -d "$VAULT/.git" ]] || { echo "нет репозитория в $VAULT" >&2; exit 1; }
if [[ -e "$HOOK" ]] && ! grep -q "lifeos-site" "$HOOK"; then
  echo "в $HOOK уже есть другой обработчик — не трогаю" >&2; exit 1
fi
cat > "$HOOK" <<HOOK
#!/bin/sh
# lifeos-site: пересборка сайта Life OS после коммита (ставит lifeos-site/scripts/install-hook.sh)
BUILD="$ROOT_DIR/scripts/build.sh"
[ -x "\$BUILD" ] && PATH="\$HOME/.local/bin:\$PATH" nohup "\$BUILD" > "\$(git rev-parse --git-dir)/lifeos-site-build.log" 2>&1 &
HOOK
chmod +x "$HOOK"
echo "обработчик поставлен: $HOOK"
