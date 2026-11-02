# Image de `site-builder` : le dépôt, ses dépendances figées, et le petit serveur deploy/builder/serveur.mjs.
# Contexte de build : la racine du dépôt (voir deploy/docker-compose.yml). Reconstruire l'image après un `git pull`.
# Tourne sous l'utilisateur `node`, jamais en root. Ses données sont dans des volumes nommés : l'uid de l'hôte n'intervient pas.
FROM node:22-bookworm-slim

# DejaVu Sans pour le rendu serveur des images Open Graph (resvg) ; rien n'est chargé par le navigateur.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && mkdir -p /srv/site/releases /data /app && chown -R node:node /srv/site /data /app

WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml ./
USER node
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .

ENV NODE_ENV=production SITE_RACINE=/srv/site SITE_DONNEES=/data PORT=8080
EXPOSE 8080
CMD ["node", "deploy/builder/serveur.mjs"]
