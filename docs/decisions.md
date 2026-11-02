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

## 2026-11-01 — Le site est la traduction du système de design « Mathieu Casteras »
Système choisi par Mat après exploration sur canvas (piste A, puis A3 + A4, puis M2 « Méthode en grille ») :
https://claude.ai/artifact/MNkRN6ZLBEuHvx3xsggQn5. `charte.css` reprend ses jetons (couleurs clair/sombre, Inter + JetBrains Mono,
espacements base 4, système carré) et ses composants (nav numérotée, repère de section « § n » dans une colonne de marge 3/12,
liste de veille date · type · titre, cartes de méthode, boutons). Quand le système change, c'est `charte.css` qui suit, pas l'inverse.

## 2026-11-01 — Polices auto-hébergées par `@fontsource`
Inter 400/500/600 et JetBrains Mono 400/500, sous-ensemble latin, importées dans `Base.astro` : Astro les sert depuis `/_astro/`,
aucune requête vers Google Fonts (règle « aucune ressource tierce »). Le mono reste réservé aux repères et métadonnées, 12–13 px.

## 2026-11-01 — Passe sécurité : CSP sans script inline, filtre SVG, URL LinkedIn, conteneur sans privilège
Le script de thème est dans `public/theme.js` (chargé bloquant dans `<head>`) pour une CSP `script-src 'self'` : même si un
SVG malveillant passait le nettoyage de l'API, rien ne s'exécuterait. Second filet au build : `src/lib/svg.ts` refuse (sans
retoucher) toute illustration qui contient un script, un gestionnaire d'événement, un lien ou une ressource externe, un
`foreignObject` ; le post est alors publié sans image et le build le signale. `url_linkedin` n'est mis dans un `href` que si c'est
une URL `https://`. Le journal de `site-builder` nettoie le motif et le User-Agent reçus (pas de ligne forgée). L'image tourne
sous `node` ; ses données sont dans des volumes nommés, l'uid de l'hôte n'intervient donc pas ; `/srv/site`, `/data` et `/app` lui appartiennent.

## 2026-11-02 — Passe sur les textes : plus de texte à compléter ni de page vide
Mat ne veut rien d'inachevé en ligne : les textes sont écrits sans mission, client ni chiffre, le contact passe par LinkedIn (aucune adresse publiée), et ce qui est vide se masque (sections de Veille, entrée Notes). On ne parle plus d'articles lus : le compteur `lus` ne mesure pas ce qui est partagé, il n'a donc pas été renommé mais retiré, et « posts partagés » reprend `posts_publies`. Les sources se groupent par catégorie, pas par note d'accès.
