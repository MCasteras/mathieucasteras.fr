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
| `SITE_WEBHOOK_SECRET` | Jeton attendu sur `POST /rebuild` ; le même va dans `VITRINE_WEBHOOK_SECRET` côté veille. Obligatoire : sans lui `site-builder` refuse de démarrer. | — |
| `HEURE_NUIT` | Heure (Europe/Paris) de la reconstruction nocturne de secours. | `03:30` |

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
`veille-fde/docs/14-site-vitrine.md § 2` et n'affiche rien d'autre. Il vérifie `version == 1`, attend chaque réponse 60 s au plus et n'écrit jamais côté veille.

**Webhook.** Quand la vitrine change, le worker de la veille fait `POST https://mathieucasteras.fr/rebuild` avec
`Authorization: Bearer <secret>` et un corps vide. Caddy le passe à `site-builder:8080`, qui répond **202** tout de suite et
reconstruit en tâche de fond. Sans le bon jeton : 401. Un appel pendant un build en programme un seul autre à la fin ; un
appel alors que `modifie_le` de `/api/vitrine` n'a pas changé depuis le dernier build réussi ne reconstruit pas
(`?force=1` pour l'imposer). Côté veille, dans `deploy/.env` : `VITRINE_WEBHOOK=https://mathieucasteras.fr/rebuild` et
`VITRINE_WEBHOOK_SECRET=<le même secret>`.

## Construction et mise en ligne : `site-builder`

Le conteneur `site-builder` (`deploy/Dockerfile`, `deploy/builder/serveur.mjs`) construit le site et le met en ligne :

- **Quand** : au démarrage du conteneur (toujours), sur le webhook, et chaque nuit à `HEURE_NUIT` (filet de sécurité).
- **Où** : chaque build va dans `releases/<horodatage>/` du volume `site_dist`, puis le lien symbolique `current` bascule
  d'un coup. Caddy sert `current`. **Un build raté ne change rien à ce qui est en ligne** ; on garde les deux dernières versions.
- **Prod** : `VITRINE_OBLIGATOIRE=1`, donc si l'API de la veille ne répond pas, le build échoue et l'ancien site reste.
- **Journal** : `/data/journal.log` (volume `site_data`) et `docker compose logs site-builder` ; `GET /sante` (sur le réseau
  `web` seulement, pas exposé par Caddy) donne le dernier build et les vingt derniers.

Sécurité : CSP sans script inline (`public/theme.js` porte la bascule de thème), filtre SVG au build en plus du nettoyage
de l'API, conteneur sans privilège (uid 1000). Un SVG refusé laisse le post sans image et une ligne dans le journal du build.

Images Open Graph : générées au build dans `/og/*.png` (1200 × 630) à partir du SVG de chaque post, ou d'une carte avec le
titre de la page ; rendu par resvg avec DejaVu Sans installée dans l'image. Aucune police n'est chargée par le navigateur.

### Déployer sur la VM

Après `serveur/` (voir plus haut) et `veille-fde` :

```bash
cd ~/mathieucasteras.fr/deploy && cp .env.example .env && nano .env   # VITRINE_API, SITE_URL, SITE_WEBHOOK_SECRET (openssl rand -hex 32)
docker compose up -d --build
docker compose logs -f site-builder                                   # « démarrage : site reconstruit en … s »
curl -I https://mathieucasteras.fr                                    # 200
```

Mise à jour (nouveau code, nouvelle note) : `deploy/update.sh` (git pull, image reconstruite, site reconstruit au
démarrage, Caddy rechargé si un fragment a changé). Essai sans Caddy : `docker compose -f docker-compose.yml -f docker-compose.seul.yml up -d --build`
publie `127.0.0.1:8087`.

### Ce que Mat fait à la main

1. Générer un secret (`openssl rand -hex 32`) et le poser des deux côtés : `SITE_WEBHOOK_SECRET` ici, `VITRINE_WEBHOOK_SECRET`
   + `VITRINE_WEBHOOK=https://mathieucasteras.fr/rebuild` dans `veille-fde/deploy/.env`.
2. Marquer les premiers documents « Vitrine » dans l'outil de veille, puis vérifier dans Réglages › Travaux que le travail
   `vitrine` a répondu 202, et dans `journal.log` que le site s'est reconstruit.

## Remonter toute la VM

Le guide complet, avec toutes les commandes dans l'ordre et les pannes déjà rencontrées : [docs/deploiement-vm.md](docs/deploiement-vm.md).

## Le serveur partagé : `serveur/`

Le dossier `serveur/` porte le Caddy unique de la VM : il obtient les certificats Let's Encrypt, sert le site à la racine du
domaine, redirige `www`, et joint l'outil de veille sous `veille.<domaine>`. Il n'y a qu'un Caddy pour toute la machine.

| Élément | Où |
| --- | --- |
| Réseau Docker `web` (externe) | créé une fois à la main : `docker network create web`. Tous les composes le déclarent `external: true`. |
| Volume `site_dist` (externe) | créé une fois : `docker volume create site_dist`. `site-builder` (séance 3) y construit le site ; Caddy le sert depuis `/srv/site`. |
| `serveur/Caddyfile` | un bloc par hôte (`{$DOMAINE}`, `www`, `veille`), rien d'autre. |
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
cd ~/mathieucasteras.fr/serveur && cp .env.example .env && nano .env     # DOMAINE
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
docker run --rm -e DOMAINE=exemple.fr -v "$PWD/serveur/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PWD/deploy/caddy/site.caddy:/etc/caddy/sites/site.caddy:ro" -v "$PWD/../veille-fde/deploy/caddy/veille.caddy:/etc/caddy/sites/veille.caddy:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile
```

## Séances

1. Squelette Astro, charte, accueil, Veille (posts, fiches, focus) sur la route publique avec repli sur le jeu d'exemple. **Fait.**
2. Outils, Sources, Notes, flux RSS (posts, fiches, notes), sitemap, page 404. **Fait.**
3. Images Open Graph depuis les SVG, `site-builder` (build, `POST /rebuild`, reconstruction nocturne, releases), fragment Caddy, README complet. **Fait.**
4. Finitions, première mise en ligne (2 nov. 2026). **Fait.** Le jeu d'exemple reste factice : un export réel n'y a pas sa place.
