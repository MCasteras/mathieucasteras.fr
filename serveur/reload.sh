#!/usr/bin/env bash
# Valide la configuration puis recharge Caddy sans coupure. À lancer après un `git pull` ici ou dans veille-fde
# (les fragments sont montés en lecture seule, Caddy ne les relit qu'au reload).
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
echo "Caddy rechargé."
