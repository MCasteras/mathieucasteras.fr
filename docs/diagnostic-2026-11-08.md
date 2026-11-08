# Diagnostic sécurité et exploitation de la VM — 8 novembre 2026

Lecture seule, faite le 8 novembre 2026 entre 10 h et 11 h (UTC) sur la VM `vps-d7501523` (OVH, Beauharnois), depuis les trois dépôts (`mathieucasteras.fr`, `veille-fde`, `Allium`, tous sur `main`), puis par `ssh vps` sans `sudo`, puis de l'extérieur (`curl`, `openssl`, `dig`, `nc`). Rien n'a été modifié en production. Les seules écritures : trois tentatives de connexion volontairement fausses sur Allium et une sur la veille (pour vérifier la limite de tentatives), un fichier `/tmp/diag-sudo.sh` déposé sur la VM pour les vérifications qui demandent `root` (à supprimer ensuite). Aucun secret n'est recopié ici.

Ce que le diagnostic n'a pas pu voir sans `root` : les règles `iptables` réellement posées, l'état du compte `debian`, le contenu de `50-cloud-init.conf`, le journal SSH et celui de `fail2ban`, la taille des journaux Docker sur le disque. Le script `/tmp/diag-sudo.sh` (lecture seule) les couvre ; voir § 8.

## 1. Résumé en dix lignes

1. **Le socle est sain** : SSH par clé seulement (vérifié de l'extérieur), seuls 22, 80 et 443 répondent en IPv4 et IPv6, TLS 1.2/1.3 avec Let's Encrypt et HTTP/3, en-têtes de sécurité complets sur les trois hôtes, routes privées qui répondent 401, documentation OpenAPI coupée, panneau admin de Caddy injoignable même depuis les conteneurs voisins.
2. **Aucun constat critique**, au sens « exploitable aujourd'hui par un inconnu ». Les constats importants sont des défenses prévues mais non actives, et des trous d'exploitation.
3. **Trois défenses documentées ne tournent pas** : `fail2ban` est en échec depuis le 2 novembre (il cherche `/var/log/auth.log`, qui n'existe pas sur Debian 12), le pare-feu de sortie des conteneurs (`pare-feu.sh`) n'est pas posé (un conteneur joint les métadonnées OVH `169.254.169.254` et le SSH de la VM), `ufw` est inactif.
4. **Un redémarrage attend depuis le 2 novembre** : le noyau `6.1.0-54` est installé, la VM tourne encore sur `6.1.0-51`. Les correctifs noyau ne sont pas actifs.
5. **Tous les clients IPv6 partagent une seule adresse** (`172.18.0.1`) aux yeux des deux applications (vérifié en base) : la limite de tentatives par adresse est partagée entre eux. Un inconnu en IPv6 bloque la connexion d'Allium pour tous les clients IPv6 pendant quinze minutes, la veille pendant cinq.
6. **Rien ne quitte la VM** sauf l'export Git hebdomadaire de la veille (qui a bien poussé le 7 novembre, sur un seul des deux dépôts). Si la VM disparaît ce soir : la base d'Allium, le mot de passe et le jeton LinkedIn de la veille, tous les `.env` et les certificats sont perdus. Le code et les documents de la veille sont sur GitHub.
7. **Personne n'est prévenu** si un conteneur meurt, si une sauvegarde échoue, si le disque se remplit ou si un certificat n'est pas renouvelé.
8. **Quatre conteneurs sur sept journalisent sans rotation** (Caddy, site-builder, les deux d'Allium) : pas de `daemon.json`, pas d'options `logging` dans leurs composes. Lent mais certain.
9. **Les dépendances de production sont propres** (`pip-audit`, `npm audit --omit=dev`, `pnpm audit --prod` : rien), mais Allium n'épingle pas ses versions Python (le Dockerfile lit `pyproject.toml` à plages), contrairement à la veille.
10. **Le DNS est presque complet** : SPF strict, mais ni DMARC ni CAA. Les pièges d'exploitation déjà rencontrés (branche, montage Caddy, `down`) sont documentés.

## 2. Ce qui est solide

| Point | Preuve |
|---|---|
| SSH par clé seulement, `00-durcissement.conf` lu avant `50-cloud-init.conf` | `grep` de `/etc/ssh/sshd_config.d/00-durcissement.conf` : `PasswordAuthentication no`, `KbdInteractiveAuthentication no` ; une seule clé dans `~mat/.ssh/authorized_keys` ; `sudo` demande un mot de passe |
| Surface réseau minimale | `ss -tlnup` : 22, 80, 443 (tcp et udp pour HTTP/3), 25 sur `127.0.0.1` seulement (exim4 tiré par `cron`), 53 sur `127.0.0.53/54`. Balayage `nc` depuis l'extérieur en IPv4 et IPv6 : 22, 80, 443 ouverts, rien d'autre sur 30 ports courants (2375, 5432, 8000, 8080, 2019 fermés) |
| Mises à jour de sécurité automatiques | `unattended-upgrades` actif, dernier passage le 8 nov. 06:29, origines Debian et Debian-Security |
| Horloge, mémoire, disque, swap | NTP synchronisé (UTC) ; 1 462 Mo utilisés sur 3 831 ; swap 2 047 Mo (0 utilisé) ; disque 8,4 Go sur 40 |
| Démon Docker non exposé | `/var/run/docker.sock` en `root:docker` 660, aucun port 2375/2376 ; seul `mat` est dans `docker` |
| Caddy 2.11.7, TLS moderne | `openssl s_client` : TLS 1.3 négocié, TLS 1.0 et 1.1 refusés, TLS 1.2 accepté ; certificats Let's Encrypt valides jusqu'au 31 janvier 2027 (site, veille) et 5 février 2027 (Allium) ; `alt-svc: h3` |
| Redirections | `http://` → 308 `https://` sur les quatre hôtes ; `www` → 301 racine ; `https://<IP>` sans SNI refusé (Caddy ne sert rien pour un hôte inconnu) |
| En-têtes par hôte | HSTS un an, `nosniff`, `X-Frame-Options DENY`, CSP, `Permissions-Policy`, `Referrer-Policy` sur les trois (détail § 3.2) |
| Panneau admin de Caddy | écoute `127.0.0.1:2019` dans le conteneur seulement ; depuis `site-builder`, `caddy:2019` répond `ECONNREFUSED` |
| Routes privées | veille : `/api/items`, `/api/docs`, `/api/openapi.json` → 401 ; Allium : `/api/moi`, `/api/admin/comptes` → 401, `/api/docs` → 404, jeton d'invitation inconnu → 404 ; site : `/sante` du builder non routé (404), `POST /rebuild` sans jeton → 401 |
| Anti-CSRF et taille de corps | Allium : `POST /api/session` sans `Origin` → 403, corps de 2 Mo → 413 (limite 1 Mo de Caddy) ; veille : vitrine publique limitée à 60 req/min par adresse (65 requêtes : 60 × 200, 5 × 429) |
| Adresse réelle du client derrière Caddy | un `X-Forwarded-For: 203.0.113.77` forgé depuis l'extérieur est ignoré : Allium a enregistré l'adresse réelle (table `login_attempt`) |
| Conteneur Allium verrouillé | `docker inspect allium-app` : `user=10001:10001 ro=true capdrop=[ALL] secopt=[no-new-privileges] pids=128 mem=384 Mo` ; la base sur `interne` seulement (`allium-db:5432` injoignable depuis `web`) ; `pg_hba` en `scram-sha-256` pour le réseau |
| Veille durcie | `cap_drop ALL`, `no-new-privileges`, utilisateur `veille`, `umask 077` ; `data/` et `deploy/ssh/` en 700/600 ; SearXNG hors de `web`, épinglé par empreinte |
| Secrets | les quatre `.env` en 600, propriété `mat`, ignorés par Git (`git check-ignore`) ; aucun `.env`, clé ou base suivi par Git |
| Sauvegardes locales | veille : six copies nocturnes `veille-AAAA-MM-JJ.db.gz` (2 h UTC), export Git du vendredi poussé le 7 nov. (786 articles, commit `9d59cfe`) ; Allium : `allium-2026-11-07.dump`, `allium-2026-11-08.dump`, journal `ok`, restauration testée le 7 nov. |
| Dépendances de production | veille : `pip-audit` sur `requirements.lock` → rien ; Allium : `pip-audit` d'un venv jetable → rien (hors `pip` du venv) ; `npm audit --omit=dev` (Allium, veille) → 0 ; `pnpm audit --prod` (site) → 0 |
| Documentation d'exploitation | `docs/deploiement-vm.md` consigne les pièges : montage Caddy cassé par un `git checkout` (8 nov.), `down` interdit, `restart` qui ne relit pas `.env`, `cron` absent, `~` du Mac |

## 3. Constats

Chaque constat dit s'il est **théorique** (aucun chemin d'exploitation connu aujourd'hui) ou **constaté** (l'effet a été observé).

### Critique

Aucun.

### Important

#### I-1. Le pare-feu de sortie des conteneurs n'est pas posé : un conteneur joint les métadonnées OVH et le SSH de la VM

- **Scénario** : un agent de la veille trompé par une page piégée, ou une faille dans n'importe quel conteneur, lit `http://169.254.169.254/` (métadonnées cloud : nom, réseau, `user-data`, clés publiques posées à l'installation) ou attaque le port 22 de la VM depuis l'intérieur. Le code de la veille a une garde anti-SSRF ; le pare-feu est la deuxième barrière prévue par `docs/15 § 4`. Allium (lot 1 : lecture de fichiers Excel) et site-builder n'ont aucune garde de ce type.
- **Preuve** (constaté) :
  ```
  $ ssh vps 'systemctl status veille-pare-feu'      → Unit veille-pare-feu.service could not be found.
  $ docker exec site-builder node -e '…http.get("http://169.254.169.254/")…'   → REACHABLE 200
  $ docker exec site-builder node -e '…net.connect(22, "172.18.0.1")…'        → SSH host port 22 reachable from container
  ```
- **Théorique ?** Oui pour l'exploitation (il faut d'abord un conteneur compromis), mais la porte est ouverte et le correctif existe déjà dans le dépôt.
- **Correctif** : `deploy/README.md` de la veille, § Durcissement, étape 1 : `sudo deploy/pare-feu.sh`, puis installer `veille-pare-feu.service`. Vérifier ensuite la collecte (« Relever maintenant ») et le webhook du site. Coût : 20 min, `sudo`, aucune coupure.

#### I-2. Un redémarrage attend depuis le 2 novembre : le noyau corrigé n'est pas celui qui tourne

- **Scénario** : les correctifs de sécurité du noyau livrés par `unattended-upgrades` ne protègent pas tant que la VM n'a pas redémarré. Les conteneurs partagent ce noyau : une faille noyau est le chemin classique de sortie d'un conteneur.
- **Preuve** (constaté) :
  ```
  $ ssh vps 'uname -r ; cat /var/run/reboot-required.pkgs ; stat -c %y /var/run/reboot-required'
  6.1.0-51-cloud-amd64
  linux-image-6.1.0-54-cloud-amd64
  2026-11-02 06:55:42
  ```
- **Théorique ?** Oui (aucune faille précise n'est visée ici), mais le délai s'allonge.
- **Correctif** : `ssh -t vps 'sudo reboot'` à une heure creuse (hors 2 h–5 h UTC, collecte et sauvegardes). Tout est en `restart: unless-stopped` : coupure d'une à deux minutes. Vérifier ensuite les trois `/api/sante`. Prévoir un rythme : un redémarrage par mois après les mises à jour (`docker-ce` 29.9.3 attend aussi : `unattended-upgrades` ne couvre que les dépôts Debian, pas celui de Docker). Coût : 5 min.

#### I-3. `fail2ban` est en échec depuis le 2 novembre

- **Scénario** : la défense contre les tentatives SSH répétées, installée et attendue par `docs/12 § 6.2`, ne tourne pas. L'exposition reste faible (mot de passe refusé), mais chaque tentative coûte du CPU et du journal, et le jour où une clé faible ou une faille OpenSSH apparaît, rien ne ralentit l'attaquant.
- **Preuve** (constaté) :
  ```
  $ ssh vps 'systemctl status fail2ban'
  Active: failed (Result: exit-code) since Mon 2026-11-02 19:31:37 UTC ; status=255/EXCEPTION
  $ ssh vps 'ls /var/log/auth.log ; systemctl is-active rsyslog'   → No such file ; inactive
  ```
  Cause : `jail.d/defaults-debian.conf` active `[sshd]` avec `backend = auto`, qui cherche `/var/log/auth.log` ; Debian 12 n'a plus `rsyslog`, tout est dans `journald`.
- **Théorique ?** Non : le service est bien arrêté. Le risque qu'il couvre est, lui, faible.
- **Correctif** : créer `/etc/fail2ban/jail.local` avec `[sshd]` `backend = systemd`, puis `sudo systemctl restart fail2ban && sudo fail2ban-client status sshd`. Coût : 5 min, `sudo`.

#### I-4. Tous les clients IPv6 ont la même adresse pour les applications : la limite de tentatives est partagée

- **Scénario** : le réseau Docker `web` n'a pas d'IPv6 ; Docker fait passer les connexions IPv6 par son relais, et Caddy voit `172.18.0.1`. Allium compte donc tous les clients IPv6 comme une seule adresse : cinq échecs en IPv6, d'où qu'ils viennent, et la connexion d'Allium répond 429 pendant quinze minutes à tous les clients IPv6 (box française typique). Même chose cinq minutes sur la veille. La logique /64 d'Allium (décision 20) ne s'exerce jamais. La protection contre la force brute, elle, tient (la limite s'applique, trop largement).
- **Preuve** (constaté, table `login_attempt` d'Allium après une tentative fausse en IPv6 et une en IPv4) :
  ```
  172.18.0.1    | diag-v6@example.invalid  | f | 2026-11-08 10:01:07
  88.187.38.150 | diag-xff@example.invalid | f | 2026-11-08 10:01:04
  $ docker network inspect web --format '{{.EnableIPv6}}'   → false
  ```
- **Théorique ?** Non : déjà noté dans `docs/15` de la veille et `deploiement-vm.md` (« Ce qui n'est pas encore réglé ») ; Allium l'hérite.
- **Correctif** : donner l'IPv6 au réseau `web` : `/etc/docker/daemon.json` avec `"ipv6": true`, `"fixed-cidr-v6": "fd00:a11:web::/64"` (ULA) et `"ip6tables": true`, puis recréer `web` avec `--ipv6` et relancer les quatre composes (coupure de quelques minutes). Les journaux et la table `login_attempt` montreront alors les vraies adresses IPv6. Alternative sans IPv6 dans Docker : retirer les `AAAA` (perte de l'IPv6 pour les visiteurs). Coût : 1 h, `sudo`, coupure courte. À coupler avec I-7 (le même `daemon.json`).

#### I-5. Rien ne quitte la VM sauf l'export Git de la veille

- **Scénario** : disque OVH perdu, VM supprimée par erreur, compte OVH compromis, `rm` malheureux. Les copies nocturnes de la veille et d'Allium sont sur le même disque que les bases. Les quatre `.env` (clés Gemini et OpenAI, secret LinkedIn, jeton GitHub, secret du webhook, mot de passe PostgreSQL) n'existent que là. Le § 4 détaille ce qui est perdu.
- **Preuve** (constaté) : `RCLONE_DESTINATION=` vide dans `deploy/.env` d'Allium et `sauvegarde.sh` n'envoie rien ; `rclone` absent (`dpkg -l rclone` → rien) ; aucune crontab autre que celle d'Allium ; export Git de la veille du 7 nov. : « poussé sur 1 dépôt(s) » (le dépôt principal `mcasterasov/…` n'a pas reçu, la clé d'écriture n'est posée que pour le secours).
- **Théorique ?** Oui jusqu'au jour où ça arrive ; la décision 13 d'Allium le reporte « avant le premier foyer invité », qui approche.
- **Correctif** : ce que la veille a déjà écrit et testé (`deploy/sauvegarde-distante.sh`, remote rclone `crypt` vers Object Storage OVH), étendu à Allium (ajouter le dossier `allium/data/sauvegardes` dans la même copie chiffrée) et aux `.env` (une archive `tar` des quatre fichiers, chiffrée par le même remote, ou leur contenu dans le gestionnaire de mots de passe de Mat). Tester une restauration depuis le stockage distant. Coût : 2 h la première fois, puis rien ; quelques centimes par mois.

#### I-6. Personne n'est prévenu quand quelque chose casse

- **Scénario** : `allium-db` plante et Allium répond 502 ; la sauvegarde nocturne échoue trois nuits ; le disque se remplit de journaux (I-7) ; Let's Encrypt ne renouvelle pas (port 80 bloqué, DNS changé). Aujourd'hui Mat l'apprend en ouvrant l'application, ou par un foyer invité.
- **Preuve** (constaté) : aucun outil de supervision sur la VM ni à l'extérieur ; `sauvegarde.sh` écrit `ÉCHEC` dans `journal.log` et sort en erreur, mais `cron` envoie le courrier à `exim4` local que personne ne lit ; les `healthcheck` Docker redémarrent sans prévenir.
- **Théorique ?** Non : c'est un manque, pas un risque.
- **Correctif**, trois briques gratuites : (1) un moniteur externe (UptimeRobot, Better Stack…) sur `https://…/api/sante` des trois hôtes, alerte par e-mail ; (2) un « dead man's switch » (healthchecks.io) : les scripts de sauvegarde pinguent une URL en fin de passage, l'absence de ping alerte ; (3) un script hebdomadaire `df`/`docker ps` qui pingue la même famille d'URL. Coût : 1 h, aucune modification risquée.

#### I-7. Quatre conteneurs journalisent sans rotation

- **Scénario** : Docker garde par défaut un seul fichier `json` sans limite par conteneur. Caddy (journal d'erreurs, accès coupé), site-builder, `allium-app` (une ligne par connexion et par erreur) et `allium-db` grossissent sans fin ; un pic d'erreurs (boucle de redémarrage, attaque sur la connexion) remplit le disque, et tout tombe en même temps.
- **Preuve** (constaté) : `docker inspect` : `log=json-file map[]` pour `caddy`, `site-builder`, `allium-app`, `allium-db` ; `/etc/docker/daemon.json` absent. La veille, elle, a `max-size 10m, max-file 3`.
- **Théorique ?** Oui à court terme (disque à 23 %, 30 Go libres), certain à long terme.
- **Correctif** : `/etc/docker/daemon.json` avec `"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}` (vaut pour les nouveaux conteneurs : relancer les composes), ou les mêmes options `logging:` dans les composes du site et d'Allium. Coût : 15 min, `sudo`, à faire en même temps que I-4.

#### I-8. Allium n'épingle pas ses versions Python

- **Scénario** : `deploy/Dockerfile` fait `pip install .` depuis `pyproject.toml` à plages (`fastapi>=0.115,<1`…) : chaque reconstruction installe les dernières versions du jour. Une version cassée ou compromise (cas « supply chain ») entre en production sans avoir été testée ; deux builds à une semaine d'écart ne donnent pas la même image. La veille a `requirements.lock` exactement pour ça (`docs/15`, scénario 24).
- **Preuve** (constaté) : `backend/pyproject.toml`, `deploy/Dockerfile` ; venv jetable du 8 nov. : `fastapi 0.162.2`, `SQLAlchemy 2.1.8`, `uvicorn 0.54.0`, `psycopg 3.3.8`, sans garantie que l'image du 7 nov. ait les mêmes.
- **Théorique ?** Oui.
- **Correctif** : un `backend/requirements.lock` (`pip freeze` depuis le venv testé), installé en premier dans le Dockerfile, mis à jour volontairement ; la CI (décision 35) le vérifie déjà en construisant l'image. Idéalement avec empreintes (`--require-hashes`). Coût : 30 min, à faire avant le lot 1.

### Mineur

#### M-1. `MOT_DE_PASSE_INITIAL` est toujours dans le `.env` de la veille, en double

- **Scénario** : le mot de passe de la veille en clair dans un fichier que lit aussi le conteneur (`docker inspect` le montre à tout membre du groupe `docker`, et une copie du `.env` le donnerait). Il ne sert qu'au premier démarrage ; `deploy/README.md` étape 0 demande de le retirer une fois le mot de passe changé dans Réglages.
- **Preuve** : `grep -c '^MOT_DE_PASSE_INITIAL=' deploy/.env` → 2 (115 caractères chacun).
- **Théorique ?** Oui. **Correctif** : supprimer les deux lignes, `docker compose up -d`. 2 min.

#### M-2. LLMNR écoute sur toutes les interfaces, sans pare-feu

- **Scénario** : `systemd-resolved` répond au protocole LLMNR (5355 tcp/udp) sur l'adresse publique. Protocole de réseau local, inutile sur un VPS ; surface de plus (empoisonnement de noms, amplification), et le seul port au-delà de 22/80/443.
- **Preuve** : `ss -tlnup` : `0.0.0.0:5355` et `[::]:5355` ; `resolvectl status` : `+LLMNR` ; `nc -u -z 51.222.138.130 5355` → « succeeded » depuis l'extérieur (test UDP peu fiable, mais rien ne filtre).
- **Théorique ?** Oui. **Correctif** : `LLMNR=no` et `MulticastDNS=no` dans `/etc/systemd/resolved.conf`, `sudo systemctl restart systemd-resolved`. 2 min.

#### M-3. Caddy, site-builder et SearXNG ne sont pas durcis comme Allium et la veille

- **Scénario** : Caddy tourne en `root` dans son conteneur, sans `cap_drop` ni `no-new-privileges` ; site-builder (utilisateur `node`, bien) n'a ni `cap_drop`, ni `no-new-privileges`, ni limite mémoire (un `astro build` peut prendre 1 Go), et écrit dans `site_dist` ; SearXNG tourne en `root` (trois processus) mais n'est joignable que sur `interne`. Une faille dans l'un d'eux donne plus qu'il ne faut.
- **Preuve** : `docker inspect` : `caddy user= capdrop=[] secopt=[]` ; `site-builder user=node capdrop=[] secopt=[] mem=0` ; `docker top veille-fde-searxng` : 3 processus `root`.
- **Théorique ?** Oui. **Correctif** : dans `serveur/docker-compose.yml`, `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]`, `security_opt: [no-new-privileges:true]` pour Caddy ; `cap_drop: [ALL]`, `no-new-privileges`, `mem_limit: 1g`, `pids_limit` pour site-builder ; vérifier que la reconstruction du site passe toujours. 30 min, une recréation de Caddy (quelques secondes).

#### M-4. Ni DMARC ni CAA dans la zone DNS

- **Scénario** : SPF est présent et strict (`v=spf1 include:mx.ovh.com -all`), mais sans DMARC un courriel forgé « de » `@mathieucasteras.fr` n'est pas rejeté par les destinataires qui ne regardent que DMARC, et Mat n'a aucun rapport. Sans CAA, n'importe quelle autorité peut émettre un certificat pour le domaine.
- **Preuve** : `dig TXT _dmarc.mathieucasteras.fr` → vide ; `dig CAA mathieucasteras.fr` → vide ; MX vers OVH.
- **Théorique ?** Oui. **Correctif** : `_dmarc TXT "v=DMARC1; p=quarantine; rua=mailto:<adresse>; adkim=s; aspf=s"` (puis `p=reject` après quelques semaines de rapports) ; `CAA 0 issue "letsencrypt.org"`. 10 min dans la zone OVH.

#### M-5. HSTS sans `includeSubDomains` ni `preload` ; `Server: Caddy` sur `www` et sur les 404 du site

- **Scénario** : un sous-domaine futur sans HSTS resterait attaquable en clair au premier accès ; la bannière `Server` ne coûte rien à un attaquant mais signe le serveur.
- **Preuve** : `curl -sI https://www.mathieucasteras.fr/` → `server: Caddy`, pas de HSTS ; `curl -sI https://mathieucasteras.fr/nexistepas/` → `server: Caddy` (le bloc `handle_errors` ne reprend pas le `-Server`).
- **Théorique ?** Oui. **Correctif** : `Strict-Transport-Security "max-age=31536000; includeSubDomains"` partout (préload à décider : irréversible pour longtemps) ; `header -Server` dans le bloc `www` et dans `handle_errors`. 10 min.

#### M-6. Pas de limite mémoire sur la veille

- **Scénario** : le worker de la veille (LLM, PDF avec PyMuPDF, SearXNG) peut gonfler ; sans limite, il pousse Allium et Caddy vers le swap puis l'OOM killer, qui choisit sa victime. Allium a 384 + 512 Mo de plafond, la veille rien.
- **Preuve** : `docker inspect veille-fde-app/worker : mem=0`.
- **Théorique ?** Oui. **Correctif** : `mem_limit` (par exemple 512 Mo pour l'API, 1 Go pour le worker, 256 Mo pour SearXNG) après avoir regardé `docker stats` une semaine. 15 min.

#### M-7. Vulnérabilités dans l'outillage de développement du front d'Allium

- **Scénario** : `vitest 3.2.x` dépend de `tinypool` et `@vitest/mocker` vulnérables (RCE par pollution de prototype, lecture de fichiers). Ce code ne va pas en production (`npm audit --omit=dev` → 0) et ne s'exécute que sur le Mac et en CI, mais la CI exécute `vitest` sur chaque PR.
- **Preuve** : `npm audit` dans une copie de `frontend/package-lock.json` : 3 vulnérabilités (1 moderate, 2 critical), toutes sous `vitest`.
- **Théorique ?** Oui. **Correctif** : monter `vitest` (la veille est déjà en 4.1.12 sans alerte). 15 min, dans le dépôt Allium.

#### M-8. Vieilles copies de la base de la veille dans `data/`

- **Preuve** : `avant-bascule-2026-11-02.db` (5,9 Mo) et `avant-reparation-2026-11-03.db` (7,6 Mo), en 600, avec jeton LinkedIn et hachage dedans. **Correctif** : les supprimer une fois sûr. 1 min.

#### M-9. L'export Git de la veille ne pousse que sur un dépôt des deux

- **Preuve** : `config/sauvegarde` : « poussé sur 1 dépôt(s) », rôle `secours` ; une seule clé dans `deploy/ssh/`. **Correctif** : poser la clé d'écriture sur `mcasterasov/veille-fde-data` ou retirer ce dépôt de `DEPOTS_DONNEES` pour que Réglages › Sauvegarde cesse de signaler un échec. 10 min.

### Remarques

- **R-1. Groupe `docker` = `root`.** `mat` est dans `docker` : toute compromission de sa clé SSH vaut `root` sans mot de passe (`docker run -v /:/host …`). C'est le compromis habituel d'une machine à une personne ; `sudo` avec mot de passe ne protège donc que du geste malheureux, pas de l'attaquant. À garder en tête, rien à changer.
- **R-2. Les conteneurs de `web` se joignent entre eux.** Vérifié : `site-builder` → `allium-app:8000` 200, `veille-fde-app:8000` 200 ; `allium-app` → `veille-fde-app` 200, `site-builder:8080/sante` lisible (historique des builds). Accepté par la décision 24 d'Allium et `docs/15` de la veille ; à revoir avec un réseau par outil (`web-allium`, `web-veille`) si un outil tiers ou moins sûr arrive. Une heure, coupure courte.
- **R-3. Images de base par tag, pas par empreinte** (`caddy:2`, `postgres:16-alpine`, `python:3.12-slim`, `node:22-alpine`, `node:22-bookworm-slim`), sauf SearXNG. Un `docker compose pull` suit le tag. Acceptable pour des images officielles ; l'épinglage par empreinte est la suite logique d'I-8.
- **R-4. Allium répond 200 et sert l'interface pour tout chemin** (`/.env` → `index.html`, 952 octets). Normal pour une application monopage ; rien ne fuit. Noté pour qu'un futur scanner ne fasse pas peur.
- **R-5. Aucune limite de débit dans Caddy** : la limitation est dans les applications (vitrine 60/min, connexions). Caddy standard n'a pas de module `rate_limit` ; en ajouter un demanderait une image `xcaddy`. Pas nécessaire aujourd'hui.
- **R-6. `via: 1.1 Caddy`** sur les réponses proxifiées (veille, Allium) : Caddy 2.11 l'ajoute ; sans conséquence.
- **R-7. `mat` ne lit pas le journal système** (`journalctl` : « not seeing messages from other users and the system »). `sudo usermod -aG systemd-journal mat` facilite les diagnostics futurs sans `sudo`.
- **R-8. Allium sur la VM est au commit `7229dff`** (fusion du lot 0) ; `main` local a trois commits de plus (CI seulement). Pas d'écart fonctionnel ; `git pull --ff-only` au prochain déploiement.
- **R-9. Données de tiers hébergées au Canada.** Les foyers invités dans Allium confient des données personnelles (e-mails, habitudes) à une VM à Beauharnois. Le Canada bénéficie d'une décision d'adéquation de l'UE et OVH est une société française, mais une phrase d'information aux foyers invités (où sont les données, qui y accède, comment les supprimer : `supprimer-foyer`) serait propre. À écrire au lot 1.
- **R-10. Une seule clé SSH autorisée, pas de clé de secours.** Si le Mac et `~/.ssh/ovh_mat` disparaissent, il reste le KVM/mode rescue d'OVH, documenté § 11 du guide. Une seconde clé (YubiKey ou clé rangée chiffrée) éviterait le passage par le rescue.
- **R-11. `exim4` écoute en local** (tiré par `cron`) : il reçoit les courriers de `cron` que personne ne lit ; sans conséquence réseau (127.0.0.1 seulement). I-6 rend ces courriers inutiles.

## 4. Que perd-on si…

| Si… | Perdu | Récupérable | Temps estimé |
|---|---|---|---|
| **la VM disparaît ce soir** | base d'Allium (un foyer, ses réglages, sessions, invitations) ; mot de passe, sessions, jeton LinkedIn, textes collés, adresses de flux e-mail et usage de la veille ; les quatre `.env` ; les certificats ; l'historique des builds | code : GitHub ; documents de la veille : dépôt `MCasteras/veille-fde-data` (export du 7 nov., sans secrets ni textes collés) ; certificats : réémis par Let's Encrypt (5 par semaine par nom) ; clés API : à régénérer chez chaque fournisseur ; LinkedIn : à reconnecter | une journée en suivant `deploiement-vm.md`, qui n'a jamais été rejoué de zéro ; Allium repart vide (ou depuis un dump si I-5 est fait) |
| **le disque se remplit** (journaux, I-7) | écritures PostgreSQL et SQLite refusées, Caddy ne renouvelle plus, sauvegardes en échec silencieux (I-6) | oui : `docker system prune`, purge des journaux | 30 min, après l'avoir remarqué |
| **`caddy` meurt et ne redémarre pas** (fragment invalide après un `git pull`) | les trois sites hors ligne | `reload.sh` valide avant de recharger ; `docker compose up -d --force-recreate caddy` | 10 min |
| **le Mac de Mat est perdu** | la clé `ovh_mat` (seule clé autorisée), la config SSH | KVM OVH, mode rescue, nouvelle clé | 1 h, stressante |
| **le compte GitHub est compromis** | les dépôts de code (publics ou privés), le dépôt de données de la veille ; la VM ne fait que `pull` (clés de déploiement en lecture) sauf le worker de la veille qui pousse sur `veille-fde-data` | copies locales sur le Mac | — |
| **un `.env` fuit** | veille : clés LLM (coût), secret LinkedIn, jeton GitHub, mot de passe initial (M-1), secret du webhook ; Allium : mot de passe PostgreSQL (inutile hors du réseau `interne`) | tout se régénère ; LinkedIn à révoquer | 1 h |
| **le domaine n'est pas renouvelé** | tout, y compris les e-mails OVH | — | question pour Mat (§ 7) |
| **Let's Encrypt refuse** (port 80 fermé, DNS changé, CAA mal posé) | sites en erreur de certificat dans 84 jours au plus | Caddy réessaie ; journal `docker logs caddy` | — |
| **une faille dans Allium (lot 1, Excel)** | ce que voit l'uid 10001 : la base Allium via le réseau, `/tmp` ; pas le disque (lecture seule), pas les autres conteneurs sauf leurs ports HTTP (R-2), pas les métadonnées si I-1 est fait | — | — |

## 5. Plan en trois paliers

### Ce soir (45 min, un `sudo`, une coupure de deux minutes)

1. `fail2ban` sur `systemd` (I-3) : `jail.local`, redémarrage, `fail2ban-client status sshd`.
2. `LLMNR=no` (M-2).
3. Retirer `MOT_DE_PASSE_INITIAL` du `.env` de la veille et `docker compose up -d` (M-1) ; supprimer les vieilles copies (M-8).
4. Lire la sortie de `/tmp/diag-sudo.txt` (§ 8), puis `rm /tmp/diag-sudo.sh /tmp/diag-sudo.txt`.
5. `sudo reboot` (I-2) hors des heures de collecte, puis vérifier les trois `/api/sante` et `docker ps`.

### Cette semaine (une demi-journée)

6. Pare-feu de sortie (I-1) : `pare-feu.sh` + unité systemd ; test `169.254.169.254` depuis un conteneur → refus ; collecte et webhook toujours bons.
7. `daemon.json` : rotation des journaux (I-7) et IPv6 (I-4) en une seule opération, recréation du réseau `web` et des quatre composes ; vérifier qu'une connexion IPv6 apparaît avec sa vraie adresse dans `login_attempt`.
8. Supervision (I-6) : moniteur externe sur les trois `/api/sante`, pings healthchecks.io dans `sauvegarde.sh` (Allium) et dans la tâche `sauvegarde_db` de la veille (ou un cron qui vérifie la date du dernier fichier), un `df` hebdomadaire.
9. Copie chiffrée hors VM (I-5) : rclone `crypt` vers Object Storage OVH, veille + Allium + archive des `.env` ; restauration testée depuis le distant ; les deux secrets rclone dans le gestionnaire de mots de passe.
10. DNS : DMARC et CAA (M-4). Export Git de la veille : un dépôt ou deux (M-9).

### Avant le lot 1 d'Allium

11. `requirements.lock` pour Allium (I-8), puis empreintes d'images (R-3) si l'envie vient.
12. Durcir Caddy et site-builder (M-3) ; limites mémoire sur la veille (M-6) ; `vitest` d'Allium (M-7).
13. HSTS `includeSubDomains`, `-Server` sur `www` et les erreurs (M-5).
14. Au lot 1 : `request_body` relevé sur la seule route d'import Excel ; lecture des fichiers dans `/tmp` (tmpfs 64 Mo : à dimensionner) ; garder le conteneur en lecture seule.
15. Rejouer `deploiement-vm.md` de zéro sur une VM jetable (ou un `docker compose` local) : les étapes 0, 8 et 11 n'ont jamais été exécutées telles quelles, et c'est le seul plan de reprise.
16. Routine mensuelle écrite : `apt upgrade` (dont `docker-ce`), redémarrage, `docker compose pull` des images par tag, `pip-audit`/`npm audit`, lecture de `journal.log`.
17. Information aux foyers invités (R-9) ; seconde clé SSH (R-10).

## 6. Comparaison des trois applications

| | Site (`site-builder`) | Veille FDE | Allium |
|---|---|---|---|
| Routes publiques | fichiers statiques, `POST /rebuild` (Bearer, `timingSafeEqual`) | `/api/vitrine*` (60/min, liste blanche), `/api/sante`, `POST /api/auth/login` | `/api/sante`, `POST /api/session`, `GET`/`POST /api/invitations/{jeton}` |
| Authentification | jeton partagé avec la veille | un mot de passe, Argon2 (paramètres par défaut de la bibliothèque : 64 Mio), session 30 jours | e-mail + mot de passe, Argon2id OWASP (19 Mio, 2 passes, sémaphore 2), session 30 jours glissants, jetons hachés |
| Limite de tentatives | — | 5 échecs/15 min par adresse → 5 min ; plafond global 50/15 min (en mémoire, perdu au redémarrage) | 5 échecs/15 min par adresse ou /64, délai progressif par e-mail (en base, survit au redémarrage) ; IPv6 confondu (I-4) pour les deux |
| Anti-CSRF | sans objet | `Sec-Fetch-Site`/`Origin` comparé à l'hôte | `Origin` = URL publique, sinon 403 (vérifié) |
| Taille de corps | aucune limite dans le fragment (le builder ignore le corps) | 32 Mo (Caddy + application) | 1 Mo (Caddy, vérifié 413) |
| Journaux | motif et User-Agent nettoyés, dans un volume | journaux applicatifs dans `data/journaux`, rotation Docker 10 Mo × 3 | accès Uvicorn coupé (jetons dans les URL), journal applicatif sans e-mail ni jeton, **pas de rotation Docker** (I-7) |
| Secrets | `SITE_WEBHOOK_SECRET` | clés LLM, LinkedIn, GitHub, webhook, SearXNG, `MOT_DE_PASSE_INITIAL` (M-1) | `POSTGRES_PASSWORD` seulement |
| Conteneur | `node`, **pas de `cap_drop`, pas de limite** | `veille`, `cap_drop ALL`, `no-new-privileges`, **pas de limite mémoire** | `10001`, lecture seule, `cap_drop ALL`, `no-new-privileges`, `pids 128`, 384 Mo |
| Dépendances | `pnpm-lock.yaml`, audit propre | `requirements.lock`, `package-lock.json`, audit propre | `package-lock.json` propre ; **Python non épinglé** (I-8) ; `vitest` à monter (M-7) |
| Sauvegarde | reconstruit depuis Git + API | copie SQLite 2 h (14 j) + export Git vendredi (1 dépôt sur 2) | `pg_dump` 3 h 15 UTC (14 j), restauration testée |
| Hors VM | GitHub (code) | GitHub (documents, sans secrets) | rien |

## 7. Questions pour Mat

1. **Secrets hors VM** : les clés Gemini/OpenAI, le secret LinkedIn, le jeton GitHub et le secret du webhook sont-ils dans ton gestionnaire de mots de passe, ou seulement dans les `.env` ? Si seulement dans les `.env`, I-5 devient prioritaire pour eux aussi.
2. **IPv6 (I-4)** : donner l'IPv6 à Docker (une heure, coupure courte, `daemon.json`) ou retirer les `AAAA` (les visiteurs IPv6 passent par IPv4) ?
3. **Copie hors VM (I-5)** : Object Storage OVH avec rclone `crypt` comme prévu par la veille, ou une alternative (Backblaze B2, un dépôt Git privé chiffré pour les dumps d'Allium, l'option de sauvegarde automatique du VPS chez OVH, payante) ?
4. **Supervision (I-6)** : un service externe gratuit (UptimeRobot, healthchecks.io) te convient-il, ou veux-tu tout garder chez toi (un cron qui t'envoie un e-mail via OVH) ?
5. **Redémarrage (I-2)** : quel créneau ? Et acceptes-tu une routine « mises à jour + redémarrage » mensuelle ?
6. **Domaine et compte OVH** : renouvellement automatique activé ? Double authentification sur le compte OVH (il donne le KVM, le DNS et la VM) ?
7. **Compte `debian`** : la sortie de `/tmp/diag-sudo.txt` dira s'il est verrouillé (étape 11 du guide). Sinon, la faire.
8. **Veille** : garder deux dépôts de données (poser la clé manquante) ou un seul ? Activer la deuxième barrière Caddy (`veille-barriere.caddy`) maintenant que deux applications privées partagent la machine ?
9. **Foyers invités** : une phrase d'information sur l'hébergement et la suppression des données (R-9) avant la première invitation hors famille ?
10. **HSTS `preload`** : s'engager (irréversible pendant des mois) ou s'en tenir à `includeSubDomains` ?

## 8. Vérifications qui demandent `root`

Le script `/tmp/diag-sudo.sh` (copie de `scratchpad`, lecture seule : `sshd -T`, `passwd -S`, `iptables -S`, `journalctl -u ssh/fail2ban`, `du` des journaux Docker, `sysctl`, noyaux installés) a été déposé sur la VM et lancé dans un terminal ; il attendait le mot de passe `sudo` de Mat au moment de la rédaction. Sa sortie est dans `/tmp/diag-sudo.txt` sur la VM. À lire, puis à intégrer ici (compte `debian`, règles de pare-feu réelles, tentatives SSH sur sept jours), puis `rm /tmp/diag-sudo.sh /tmp/diag-sudo.txt`.

