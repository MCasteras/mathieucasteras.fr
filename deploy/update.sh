#!/usr/bin/env bash
# Mise à jour du site sur la VM : git pull, reconstruction de l'image site-builder (qui reconstruit le site au démarrage),
# et rechargement de Caddy si un fragment ou le Caddyfile a changé.
set -euo pipefail
cd "$(dirname "$0")/.."
avant=$(git rev-parse HEAD)
git pull --ff-only
apres=$(git rev-parse HEAD)
(cd deploy && docker compose up -d --build)
if [ "$avant" != "$apres" ] && git diff --name-only "$avant" "$apres" | grep -qE '^(serveur/|deploy/caddy/)'; then
  ./serveur/reload.sh
fi
echo "Site : $(git log --oneline -1). Journal : docker compose -f deploy/docker-compose.yml logs -f site-builder"
