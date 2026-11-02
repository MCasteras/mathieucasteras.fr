# mathieucasteras.fr — consignes pour Claude Code

Site personnel de Mat, Forward Deployed Engineer : vitrine publique, en français, **statique** (Astro + TypeScript, contenu Markdown
via les content collections). Pas de base, pas de connexion, pas de formulaire : Caddy sert des fichiers. Hébergé sur la VM OVH
à la racine du domaine, derrière le Caddy unique de la machine, qui vit dans `serveur/` de ce dépôt (réseau Docker externe `web`).

## À lire avant de coder
- `README.md` : lancer, construire, ajouter une note, variables, contrat avec `serveur` et avec la veille.
- `docs/decisions.md` : les bibliothèques retenues et pourquoi.
- `veille-fde/docs/14-site-vitrine.md` : le contrat de la route publique `GET /api/vitrine*` (§ 2) et du webhook (§ 3).

## Règles non négociables
- Une seule source de contenu de veille : `GET <VITRINE_API>/api/vitrine*`, en lecture seule. Le site n'y écrit jamais et n'affiche
  rien d'autre que ce qu'elle renvoie (c'est ce que Mat a marqué lui-même).
- Aucune donnée réelle de la veille dans le dépôt : seul le jeu d'exemple `fixtures/vitrine/*.json`, clairement factice (`[EXEMPLE]`).
- Si l'API est injoignable au build : repli sur le jeu d'exemple avec un bandeau, **sauf** si `VITRINE_OBLIGATOIRE=1` (production),
  où le build échoue. Un schéma d'une autre version que `1` fait toujours échouer le build.
- Aucun chiffre, aucune mission, aucun client inventé dans les textes : laisser des `[À COMPLÉTER]` explicites. Les chiffres de
  l'outil de veille viennent uniquement de `/api/vitrine/stats`.
- Les SVG des posts sont déjà nettoyés par l'API : on les insère tels quels, sans les retoucher.
- Une source sans `url` s'affiche sans lien ; les `refs` renvoient aux `n` des `sources` de la même page.
- Pas de traqueur, pas de police ni de script chargé depuis un tiers. Lisible au téléphone, thème clair et sombre.
- Les secrets (`SITE_WEBHOOK_SECRET`…) sont dans `deploy/.env` et `serveur/.env`, jamais dans le code ni la doc.
- Pas de moissonnage de LinkedIn : le lien `url_linkedin` suffit.

## Organisation
- `src/data/vitrine.ts` lit l'API (ou le jeu d'exemple) ; `src/content.config.ts` en fait des collections (`posts`, `fiches`,
  `focus`, `sources`, `vitrine` = index + stats) à côté des `notes` Markdown (`src/content/notes/`).
- `src/pages/` : accueil, `veille/` (posts, fiches, focus), `outils/`, `sources/`, `notes/`, flux `*.xml.ts`.
- `src/styles/charte.css` : la charte (polices système, deux thèmes). `src/layouts/Base.astro` : le gabarit.
- `tests/` : vitest ; `tests/build.test.ts` construit le site sur le jeu d'exemple.
- `deploy/` : docker-compose (`site-builder`), fragment Caddy `caddy/site.caddy`, `.env.example`.
- `serveur/` : le Caddy partagé de la VM (compose, `Caddyfile` à un bloc par hôte, `reload.sh`, `.env.example`). Le Caddyfile ne
  contient que les hôtes ; les directives d'un site vont dans son fragment. Après tout changement : `reload.sh`,
  jamais `docker compose down`. Un nouveau service = un conteneur nommé joint à `web`, un fragment, un bloc d'hôte, pas de port publié.

## Façon de travailler
- Une séance = une étape du plan ; terminer par `pnpm test`, puis un commit en français qui dit quoi et pourquoi.
- Quand une règle ou un choix change : mettre à jour `README.md` ou `docs/decisions.md` dans le même commit.
- Préférer la solution la plus simple qui respecte la cible.
