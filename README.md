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

`brouillon: true` garde la note hors des listes et du flux.

## Contrat avec la veille

Le site lit, au build, les six routes `GET <VITRINE_API>/api/vitrine{,/posts,/fiches,/focus,/sources,/stats}` décrites dans
`veille-fde/docs/14-site-vitrine.md § 2` et n'affiche rien d'autre. Il vérifie `version == 1`. Il n'écrit jamais côté veille.
La veille appelle `POST https://<domaine>/rebuild` quand la vitrine change (séance 3).

## Contrat avec `serveur`

À venir (séance 3) : conteneur `site-builder` sur le réseau Docker externe `web`, volume `site_dist`, fragment
`deploy/caddy/site.caddy` à importer dans le bloc du domaine racine.

## Séances

1. Squelette Astro, charte, accueil, Veille (posts, fiches, focus) sur la route publique avec repli sur le jeu d'exemple. **Fait.**
2. Outils, Sources, Notes, flux RSS (posts, fiches, notes), sitemap.
3. Images Open Graph depuis les SVG, `site-builder` (build, `POST /rebuild`, reconstruction nocturne), fragment Caddy, README complet.
4. Finitions, export réel en jeu d'exemple, première mise en ligne.
