# Décisions

Les bibliothèques retenues et pourquoi. Une entrée par choix, datée ; on ajoute, on ne réécrit pas.

## 2026-11-01 — Astro 7 + TypeScript strict, sans framework côté client
Générateur statique qui rend des pages HTML sans JavaScript par défaut, avec des content collections typées (zod) pour le
Markdown **et** pour des données chargées par un loader maison : la vitrine de la veille devient des collections comme les
notes, interrogées de la même façon dans les pages. Pas de React/Vue : les deux scripts du site (thème) tiennent en dix lignes inline.
Astro 7.4 est la version que `pnpm create astro` installe aujourd'hui ; l'API Content Layer (`astro/loaders`) est celle d'Astro 5.

## 2026-11-01 — pnpm
Déjà installé sur le poste et dans l'image de build ; `pnpm-lock.yaml` fait foi.

## 2026-11-01 — vitest pour les tests
Même outillage que Vite/Astro, sans configuration. Deux familles : tests unitaires de `src/data/vitrine.ts` avec un faux `fetch`,
et un test qui lance `astro build` sur le jeu d'exemple et lit le HTML produit (une page par document, source sans lien, SVG
intact, échec en production sans API).

## 2026-11-01 — Lecture de la vitrine au build, jamais dans le navigateur
Les six routes sont lues une fois par build (`globalThis.__vitrine`, partagé entre loaders) : quelques requêtes, loin de la limite
de 60/min, pas besoin de CORS ni d'ETag. Repli sur `fixtures/vitrine/*.json` hors production, erreur si `VITRINE_OBLIGATOIRE=1`.

## 2026-11-01 — Polices système, deux thèmes en CSS pur
Aucune ressource tierce ; `prefers-color-scheme` par défaut, surcharge `data-theme` mémorisée dans `localStorage` du visiteur.

## 2026-11-01 — URL avec barre finale, un dossier par page
`trailingSlash: 'always'` et `build.format = 'directory'` : `file_server` de Caddy sert `/veille/` depuis `veille/index.html`
sans règle de réécriture.

## 2026-11-01 — `@astrojs/rss` et `@astrojs/sitemap`
Les intégrations officielles : le flux est écrit par une route `*.xml.ts` à partir des collections (RSS 2.0, `content:encoded`
pour le texte complet des posts), le sitemap par l'intégration à partir de `site`. Les transformations document → entrée de
flux sont dans `src/lib/flux.ts`, sans dépendance à Astro, pour être testées seules.

## 2026-11-01 — Les chiffres de l'outil de veille : `/api/vitrine/stats` seulement, sans l'usage LLM
La page `/outils/veille/` affiche les compteurs et les articles par mois tels que l'API les renvoie. Les appels et coûts
par modèle, que l'API renvoie aussi, ne sont pas affichés : ce n'est pas un chiffre qui dit quelque chose au visiteur.

## 2026-11-01 — Images Open Graph avec `@resvg/resvg-js`, au build
Rendu SVG → PNG natif (binaire précompilé), sans navigateur ni Chromium dans l'image : quelques dizaines de millisecondes par
image. Un post avec illustration donne son SVG centré sur 1200 × 630 ; les autres pages une carte avec le titre. Les polices
viennent du système de build (DejaVu Sans dans l'image Docker) ; le navigateur n'en charge aucune. Alternative écartée :
`sharp` (plus lourd, librsvg) ou satori + un navigateur.

## 2026-11-01 — `site-builder` : un serveur Node sans dépendance, releases et lien symbolique
Le webhook, la file (un build à la fois, un seul en attente) et le saut sur `modifie_le` inchangé tiennent dans
`deploy/builder/builder.mjs`, testé seul avec un build factice. Chaque build va dans `releases/<horodatage>/` du volume, puis
`current` bascule par `rename` d'un lien symbolique : un build raté ne touche pas au site en ligne, et on garde deux versions.
Astro déplace ses fichiers par `rename`, impossible vers un volume (autre système de fichiers) : on construit dans le
conteneur puis on copie la release d'un bloc.

## 2026-11-01 — `packageManager: pnpm@8.15.4`
Le lockfile est au format 6 (pnpm 8) ; corepack lit `packageManager` et installe la même version dans l'image Docker, sinon
`--frozen-lockfile` refuse.
