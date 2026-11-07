# Intégrer un outil à mathieucasteras.fr : règles et marche à suivre

Ce guide est le contrat entre la VM, le Caddy partagé, le site et chaque outil qui vient s'y greffer. Il reprend ce qui a été fait pour Veille FDE (premier outil, 2 nov. 2026) et le rend réutilisable. Un outil qui respecte ces règles s'ajoute sans toucher au code du site ni à celui des autres outils.

Vocabulaire : **l'outil** est l'application à intégrer (son propre dépôt) ; **le site** est ce dépôt (Astro, `site-builder`) ; **le serveur** est le Caddy unique de la VM (`serveur/` de ce dépôt).

## 1. Code de bonne conduite

Les règles valent pour tout outil, qu'il alimente le site ou non.

### Sur la machine

1. **Un seul Caddy.** Aucun outil ne publie de port, ne demande de certificat ni ne touche au port 80/443. Il se joint au réseau Docker externe `web` et fournit un fragment Caddy ; c'est le serveur qui porte l'hôte, le TLS et la redirection `www`.
2. **Un conteneur nommé par entrée HTTP.** Le serveur le joint par son nom (`reverse_proxy nom-du-conteneur:port`). Les autres processus de l'outil (worker, moteur de recherche, base) restent sur un réseau interne à l'outil, jamais sur `web`.
3. **Un fragment Caddy sans hôte ni TLS**, dans le dépôt de l'outil (`deploy/caddy/<outil>.caddy`), monté par dossier en lecture seule dans le serveur. Il porte `encode`, le `reverse_proxy` et les en-têtes de sécurité. Après tout changement : `serveur/reload.sh`, jamais `docker compose down`.
4. **Un sous-domaine par outil** (`<outil>.mathieucasteras.fr`), enregistrement DNS A et AAAA vers la VM. La racine est réservée au site.
5. **Un projet Docker propre** (`name:` dans le compose) et un dossier `deploy/` avec `docker-compose.yml`, `.env.example`, `README.md` ou équivalent. Les composes déclarent `web` `external: true` et ne le créent jamais.
6. **Les secrets vivent dans `deploy/.env`**, jamais dans le code, la doc ni Git. `.env.example` liste les variables avec un commentaire ; le dépôt peut être public, il ne contient que l'endroit où mettre les secrets.
7. **Conteneurs sans privilège**, `restart: unless-stopped`, taille maximale du corps des requêtes posée dans le fragment (`request_body { max_size … }`) avant toute lecture par l'application.
8. **Journaux et sauvegardes.** L'outil écrit ses journaux là où `docker compose logs` les trouve ; ses données vivent dans un volume ou un dossier `data/` hors Git, avec une copie nocturne si elles comptent.
9. **Les données réelles ne sont jamais commitées** : ni exports, ni bases, ni textes personnels. Un jeu d'exemple, s'il en faut un, est factice et marqué comme tel.
10. **Pas de traqueur, pas de police ni de script chargé depuis un tiers**, en français, lisible au téléphone, thème clair et sombre : ce qui vaut pour le site vaut pour l'interface de l'outil si elle est exposée.

### Vis-à-vis du site

11. **Le site ne lit qu'une API publique en lecture seule, au build**, jamais dans le navigateur. Il n'écrit jamais chez l'outil et n'affiche rien d'autre que ce que l'API renvoie.
12. **Seul Mat rend quelque chose public.** L'API n'expose que ce qu'il a marqué à la main (un drapeau posé depuis l'outil, jamais par une tâche automatique), par liste blanche de champs. Ce qui n'est pas dans la liste blanche ne sort pas : notes, brouillons, identifiants internes, coûts, adresses privées.
13. **Aucun chiffre inventé.** Les chiffres affichés sur le site viennent d'une route d'agrégats de l'API, jamais d'un texte écrit à la main.
14. **Un schéma versionné.** L'API porte un numéro de version ; le site refuse de construire sur une version qu'il ne connaît pas, plutôt que d'afficher n'importe quoi.
15. **Si l'API ne répond pas au build**, le site se construit sur le jeu d'exemple avec un bandeau en développement, et échoue en production (`VITRINE_OBLIGATOIRE=1`) : l'ancien site reste en ligne, rien de factice ne sort.

## 2. Ajouter un outil sans contenu sur le site

C'est le cas minimal : l'outil a sa propre interface sous son sous-domaine, le site ne fait que le mentionner.

### Dans le dépôt de l'outil

`deploy/docker-compose.yml` :

```yaml
name: <outil>
services:
  <outil>-app:
    build: { context: .., dockerfile: deploy/Dockerfile }
    container_name: <outil>-app
    env_file: .env
    restart: unless-stopped
    expose: ["8000"]
    networks: [web, interne]
  # autres services (worker, base…) : networks: [interne] seulement

networks:
  web:
    external: true      # créé une fois par serveur/ : docker network create web
  interne: {}
```

`deploy/caddy/<outil>.caddy` :

```caddy
# Fragment Caddy de <outil>, importé par le Caddy partagé (serveur/ du dépôt mathieucasteras.fr) dans le bloc
# <outil>.{$DOMAINE}. Ni hôte, ni TLS : le serveur s'en charge.
encode zstd gzip

request_body {
    max_size 8MB
}

reverse_proxy <outil>-app:8000 {
    header_up X-Forwarded-Proto {scheme}
}

header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy no-referrer
    -Server
}
```

Si l'application tient des sessions, elle lit `X-Forwarded-For` et `X-Forwarded-Proto` (uvicorn : `--proxy-headers --forwarded-allow-ips='*'`), limite les tentatives de connexion par adresse, et laisse publiques seulement les routes qui doivent l'être.

### Dans ce dépôt (le serveur)

1. `serveur/docker-compose.yml`, volumes de `caddy` : monter le dossier du fragment, par dossier et non par fichier (un `git pull` remplace le fichier, un montage de fichier garderait l'ancienne version) :
   ```yaml
   - ${CHEMIN_<OUTIL>:-/home/mat/<outil>}/deploy/caddy:/etc/caddy/sites/<outil>:ro
   ```
2. `serveur/.env.example` : la variable `CHEMIN_<OUTIL>` avec son défaut.
3. `serveur/Caddyfile` : un bloc d'hôte, rien d'autre :
   ```caddy
   # <Outil>, <privé ou public> (dépôt <outil>, deploy/caddy/<outil>.caddy)
   <outil>.{$DOMAINE} {
   	import /etc/caddy/sites/<outil>/<outil>.caddy
   }
   ```
4. Valider sans la VM (ajouter le montage du nouveau fragment à la commande du README § « Valider sans la VM »).

### Sur la VM, dans l'ordre

```bash
ssh vps 'git clone git@github.com:MCasteras/<outil>.git /home/mat/<outil>'
```

Puis `deploy/.env` de l'outil, `docker compose up -d --build` dans son `deploy/`, et enfin, après `git pull` du dépôt du site (fragment monté, bloc d'hôte) :

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/serveur && docker compose up -d && ./reload.sh'
```

`docker compose up -d` recrée Caddy si un montage a été ajouté ; `reload.sh` valide et recharge sans coupure. Vérifier : `curl -I https://<outil>.mathieucasteras.fr` répond 200 (ou la page de connexion), et les autres hôtes répondent toujours.

### Le mentionner sur le site

Une fiche Markdown dans `src/content/outils/<outil>.md` suffit (`titre`, `resume`, `ordre`, `lien` facultatif, `brouillon`) : elle apparaît sur `/outils/` et a sa page `/outils/<outil>/`. Pas de chiffre dans le texte : une phrase générale vraie plutôt qu'un exemple douteux.

## 3. Ajouter un outil qui alimente le site

En plus du § 2, l'outil expose une API publique en lecture seule et prévient le site quand elle change. C'est le modèle de la vitrine de Veille FDE (`veille-fde/docs/14-site-vitrine.md`).

### L'API publique de l'outil

| Règle | Ce que fait Veille FDE |
| --- | --- |
| Un préfixe public, tout le reste privé | `GET /api/vitrine*` sans session ; tout autre `/api` exige la session de Mat. |
| Lecture seule, `GET` seulement, pas de cookie ni de jeton | oui |
| Index avec `version` et `modifie_le` | `/api/vitrine` → `{version: 1, comptes: {…}, modifie_le}` ; `modifie_le` bouge dès qu'un document exposé ou un drapeau change, retrait compris. |
| Liste blanche de champs, documents marqués publics par Mat | drapeau `vitrine`, posé depuis l'interface, exigeant le statut final du document ; les tâches ne le posent jamais. |
| Agrégats pour les chiffres | `/api/vitrine/stats`, sans coût ni consommation. |
| Cache et limites | `Cache-Control: public, max-age=300`, `ETag` et 304, 60 requêtes par minute et par adresse (429 avec `Retry-After`). |
| Contenu nettoyé à la source | SVG filtrés avant de sortir ; URL bornées à `http(s)`. |
| Pas de CORS par défaut | le site lit au build, côté serveur ; une origine n'est admise que si une page du navigateur doit lire l'API. |

Le contrat de l'API est écrit dans la doc de l'outil, routes et champs un par un : c'est ce document que le site suit, pas le code.

### Le webhook

Quand le contenu public change, l'outil fait `POST https://mathieucasteras.fr/rebuild` avec `Authorization: Bearer <secret>` et un corps vide. `site-builder` répond 202 tout de suite et reconstruit en tâche de fond ; sans le bon jeton : 401 ; si `modifie_le` n'a pas changé depuis le dernier build réussi, il ne reconstruit pas (`?force=1` pour l'imposer).

Un seul secret pour tous les outils (`SITE_WEBHOOK_SECRET` côté site) : chaque outil le reçoit dans son `.env` sous le nom qu'il veut. Un outil qui n'a pas de webhook est quand même repris chaque nuit (`HEURE_NUIT`) et au démarrage de `site-builder`.

Aujourd'hui `site-builder` compare un seul `modifie_le` (celui de la vitrine de la veille). Un second outil alimentant le site demande d'étendre cette comparaison à plusieurs sources (une `modifie_le` par API, le build se fait si l'une a bougé) : c'est une petite évolution de `deploy/builder/serveur.mjs`, à noter dans `docs/decisions.md`.

### Côté site

1. `src/data/<outil>.ts` : lecture de l'API au build, sur le modèle de `src/data/vitrine.ts` (base d'URL par variable d'environnement `<OUTIL>_API`, délai de 60 s par réponse, vérification de `version`, repli sur `fixtures/<outil>/*.json` sauf `VITRINE_OBLIGATOIRE=1`, bandeau sur le jeu d'exemple).
2. `fixtures/<outil>/*.json` : jeu d'exemple **factice**, marqué `[EXEMPLE]` dans les titres, jamais un export réel.
3. `src/content.config.ts` : une collection par type de document, avec son schéma `zod` strict (ce qui n'est pas dans le schéma n'existe pas pour le site).
4. `src/pages/<outil>/` : les pages, dans la charte (`src/styles/charte.css`, gabarit `src/layouts/Base.astro`), avec flux RSS si le contenu est daté et images Open Graph générées au build si des visuels existent.
5. `src/content/outils/<outil>.md` : la fiche de l'outil, qui peut recevoir les chiffres d'agrégats de l'API comme `/outils/veille/`.
6. `tests/` : un test de build sur le jeu d'exemple et un test du lecteur d'API (version inconnue → échec, API muette → repli ou échec selon `VITRINE_OBLIGATOIRE`).
7. `README.md` § Variables et § Contrat, `deploy/.env.example`, `docs/decisions.md`.

## 4. Liste de vérification avant de déclarer l'outil intégré

- [ ] DNS A et AAAA de `<outil>.mathieucasteras.fr` propagés.
- [ ] Conteneur nommé, joint à `web`, aucun `ports:` dans aucun compose de l'outil.
- [ ] Fragment Caddy sans hôte ni TLS, monté par dossier, bloc d'hôte dans `serveur/Caddyfile`, `caddy validate` passe.
- [ ] `serveur/reload.sh` exécuté ; `https://mathieucasteras.fr`, `www` (301) et `veille.…` répondent toujours.
- [ ] `.env.example` complet, aucun secret dans Git (`git log -p | grep -i secret` ne remonte rien).
- [ ] Routes privées derrière une session, tentatives de connexion limitées, corps borné.
- [ ] Si API publique : `version`, `modifie_le`, liste blanche, cache, limite de débit, contrat écrit dans la doc de l'outil.
- [ ] Si webhook : 202 observé dans les journaux de l'outil, « site reconstruit » dans `journal.log` de `site-builder`.
- [ ] Fiche `src/content/outils/<outil>.md` relue : aucun chiffre, aucune mission, aucun client inventé.
- [ ] `pnpm test` vert ; `docs/deploiement-vm.md` et `README.md` mis à jour (tableau des hôtes, ordre de déploiement).
- [ ] Sauvegarde des données de l'outil prévue (copie nocturne, dépôt Git ou autre), et `caddy_data` toujours dans les sauvegardes.
