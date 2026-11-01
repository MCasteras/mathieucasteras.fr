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
