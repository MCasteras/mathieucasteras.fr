# mathieucasteras.fr

Site personnel de Mat, Forward Deployed Engineer. Statique (Astro), en français. Une partie du contenu vient de la vitrine
publique de son outil de veille (`veille-fde`, route `GET /api/vitrine*`) ; le reste est du Markdown dans ce dépôt.

## Lancer en local

```bash
pnpm install
pnpm dev
```

Sans `VITRINE_API`, le site se construit sur le jeu d'exemple `fixtures/vitrine/*.json` (factice, un bandeau le dit sur chaque
page). Pour lire la vraie vitrine :

```bash
VITRINE_API=https://veille.<domaine> pnpm dev
```

Construire : `pnpm build` (dans `dist/`). Tests : `pnpm test` (le test de build prend quelques secondes).

## Variables

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `VITRINE_API` | Base de l'API de la veille (`https://veille.<domaine>`), sans barre finale. | vide → jeu d'exemple |
| `VITRINE_OBLIGATOIRE` | `1` : interdit le repli sur le jeu d'exemple, le build échoue si l'API ne répond pas. À poser en production. | vide |
| `SITE_URL` | URL publique du site, pour les URL absolues (canonical, Open Graph, flux). | `https://mathieucasteras.fr` |
| `SITE_WEBHOOK_SECRET` | Jeton attendu sur `POST /rebuild` (séance 3). | — |

Les valeurs de production vont dans `deploy/.env` (jamais commité) ; `deploy/.env.example` les liste.

## Ajouter une note

Un fichier Markdown dans `src/content/notes/`, avec en tête :

```markdown
---
titre: Le titre
date: 2026-11-01
resume: Une phrase facultative.
brouillon: false
---
```

`brouillon: true` garde la note hors des listes et du flux. Même principe pour un outil dans `src/content/outils/`
(`titre`, `resume`, `ordre`, `lien` facultatif) ; la page `/outils/veille/` ajoute les chiffres de `/api/vitrine/stats`.

Flux RSS : `/veille/posts.xml`, `/veille/fiches.xml`, `/notes.xml`. Plan du site : `/sitemap-index.xml`.

## Contrat avec la veille

Le site lit, au build, les six routes `GET <VITRINE_API>/api/vitrine{,/posts,/fiches,/focus,/sources,/stats}` décrites dans
`veille-fde/docs/14-site-vitrine.md § 2` et n'affiche rien d'autre. Il vérifie `version == 1`. Il n'écrit jamais côté veille.
La veille appelle `POST https://<domaine>/rebuild` quand la vitrine change (séance 3).

## Le serveur partagé : `serveur/`

Le dossier `serveur/` porte le Caddy unique de la VM : il obtient les certificats Let's Encrypt, sert le site à la racine du
domaine, redirige `www`, et joint l'outil de veille sous `veille.<domaine>`. Il n'y a qu'un Caddy pour toute la machine.

| Élément | Où |
| --- | --- |
| Réseau Docker `web` (externe) | créé une fois à la main : `docker network create web`. Tous les composes le déclarent `external: true`. |
| Volume `site_dist` (externe) | créé une fois : `docker volume create site_dist`. `site-builder` (séance 3) y construit le site ; Caddy le sert depuis `/srv/site`. |
| `serveur/Caddyfile` | un bloc par hôte (`{$DOMAINE}`, `www`, `veille`), l'adresse ACME, rien d'autre. |
| `deploy/caddy/site.caddy` | les directives du site : `root`, `file_server`, compression, en-têtes, `/rebuild` → `site-builder:8080`. |
| `veille-fde/deploy/caddy/veille.caddy` | les directives de la veille (`reverse_proxy veille-fde-app:8000`), lues dans le clone voisin (`CHEMIN_VEILLE`). |
| Certificats | volume `caddy_data`, à inclure dans les sauvegardes. |

Chaque application : un conteneur nommé joint à `web`, aucun port publié ; Caddy pose `X-Forwarded-For` et `X-Forwarded-Proto`.

### Mise en place sur la VM (une fois)

Machine préparée selon `veille-fde/docs/12 § 6.2` (Debian 12, Docker, utilisateur `mat`). DNS : `A`/`AAAA` de la racine, de
`www` et de `veille` vers l'IP du VPS, propagés (`dig +short mathieucasteras.fr`). Les deux dépôts doivent être clonés
avant le premier démarrage : Caddy monte `veille.caddy` depuis le clone voisin, et un fichier absent deviendrait un dossier vide.

```bash
git clone git@github.com:MCasteras/mathieucasteras.fr.git ~/mathieucasteras.fr
git clone git@github.com:MCasteras/veille-fde.git ~/veille-fde
cd ~/mathieucasteras.fr/serveur && cp .env.example .env && nano .env     # DOMAINE, ACME_EMAIL
docker network create web
docker volume create site_dist
docker compose up -d
docker compose logs -f caddy                                             # certificats : quelques secondes par hôte
```

Tant que la veille et `site-builder` ne tournent pas, Caddy répond 502 sur leurs chemins : c'est normal. Ensuite, dans
l'ordre : `veille-fde` (`deploy/README.md`), puis le site (`deploy/`, séance 3).

### Au quotidien

- Après un `git pull` ici ou dans `veille-fde` : `serveur/reload.sh` (valide puis recharge sans coupure). Jamais `docker compose down` pour recharger.
- Mise à jour de Caddy : `cd serveur && docker compose pull && docker compose up -d`.
- Ajouter un service sur la VM : un conteneur nommé joint à `web` dans son dépôt, un fragment Caddy sans hôte ni TLS, un
  montage dans `serveur/docker-compose.yml`, un bloc `nom.{$DOMAINE} { import … }` dans le Caddyfile, un enregistrement DNS,
  puis `docker compose up -d && ./reload.sh`.
- Vérifier : `curl -I https://mathieucasteras.fr`, `curl -I https://www.mathieucasteras.fr` (301), `curl https://veille.mathieucasteras.fr/api/vitrine`.

### Valider sans la VM

```bash
docker run --rm -e DOMAINE=exemple.fr -e ACME_EMAIL=a@exemple.fr -v "$PWD/serveur/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PWD/deploy/caddy/site.caddy:/etc/caddy/sites/site.caddy:ro" -v "$PWD/../veille-fde/deploy/caddy/veille.caddy:/etc/caddy/sites/veille.caddy:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile
```

## Séances

1. Squelette Astro, charte, accueil, Veille (posts, fiches, focus) sur la route publique avec repli sur le jeu d'exemple. **Fait.**
2. Outils, Sources, Notes, flux RSS (posts, fiches, notes), sitemap, page 404. **Fait.**
3. Images Open Graph depuis les SVG, `site-builder` (build, `POST /rebuild`, reconstruction nocturne), fragment Caddy, README complet.
4. Finitions, export réel en jeu d'exemple, première mise en ligne.
