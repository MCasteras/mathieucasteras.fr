# Déployer la VM de A à Z

Le guide pour remonter toute la machine : le Caddy partagé, la veille, le site et Allium. Il reprend ce qui a été fait le 2 novembre 2026 sur le VPS OVH, avec les pièges rencontrés.

**Ce dépôt est public** : aucun secret ici, seulement l'endroit où les mettre.

## Où s'exécute chaque commande

La moitié des erreurs du premier déploiement viennent de là.

| La commande | S'exécute sur |
| --- | --- |
| commence par `ssh vps '…'` | la VM, lancée depuis le Mac |
| est tapée dans un terminal dont l'invite affiche `mat@vps-…` | la VM |
| tout le reste | le Mac |

Toujours écrire les chemins de la VM en entier (`/home/mat/…`) dans une commande `ssh vps … nano`. Non protégé par des guillemets, `~` est remplacé par le dossier du Mac (`/Users/mathieu/…`) avant même de partir.

## Vue d'ensemble

```
Internet ── 80/443 ──► caddy ──┬── mathieucasteras.fr ──► volume site_dist (fichiers statiques)
                               │                  └─/rebuild ──► site-builder:8080
                               ├── www ──► redirection vers la racine
                               ├── veille.mathieucasteras.fr ──► veille-fde-app:8000
                               └── allium.mathieucasteras.fr ──► allium-app:8000

Réseau Docker `web` : caddy, site-builder, veille-fde-app, allium-app. Aucun autre port publié.
Réseau `interne` (veille) : veille-fde-app, veille-fde-worker, veille-fde-searxng.
Réseau `interne` (allium) : allium-app, allium-db.
```

L'ordre compte : **Caddy, puis la veille, puis le site, puis Allium** (Allium ne dépend que de Caddy, mais le site, lui, dépend de la veille). En production, le site refuse de se construire si la veille ne répond pas, ce qui évite de publier le jeu d'exemple factice.

| Élément | Où |
| --- | --- |
| Caddy | `/home/mat/mathieucasteras.fr/serveur/` |
| Site | `/home/mat/mathieucasteras.fr/deploy/` |
| Veille | `/home/mat/veille-fde/deploy/` |
| Base de la veille | `/home/mat/veille-fde/data/veille.db` |
| Copies nocturnes de la veille | `/home/mat/veille-fde/data/backups/` |
| Allium | `/home/mat/allium/deploy/` (dépôt `MCasteras/Allium`, dossier en minuscules) |
| Base d'Allium | volume Docker `allium_pgdata` |
| Copies nocturnes d'Allium | `/home/mat/allium/data/sauvegardes/` (`deploy/sauvegarde.sh`, crontab de `mat`) |
| Secrets | `deploy/.env` de la veille, `deploy/.env` du site, `deploy/.env` d'Allium, `serveur/.env` (jamais dans Git) |

## 0. Sauver l'ancienne machine (si elle existe encore)

À faire **avant** de supprimer ou réinstaller quoi que ce soit. Depuis le Mac :

```bash
mkdir -p ~/sauvegarde-vps
```

```bash
scp vps:/home/mat/veille-fde/deploy/.env ~/sauvegarde-vps/veille.env
```

```bash
scp vps:/home/mat/mathieucasteras.fr/deploy/.env ~/sauvegarde-vps/site.env
```

Copie de la base, cohérente même si la veille tourne :

```bash
ssh vps 'docker exec veille-fde-app python -c "import sqlite3; s=sqlite3.connect(\"/data/veille.db\"); d=sqlite3.connect(\"/data/sauvegarde-migration.db\"); s.backup(d); d.close()"'
```

```bash
scp vps:/home/mat/veille-fde/data/sauvegarde-migration.db ~/sauvegarde-vps/veille.db
```

Ces fichiers contiennent tes clés et tes données : ne les mets dans aucun dépôt, et supprime-les une fois la nouvelle machine validée.

## 1. Commander le VPS et poser ta clé SSH

Le modèle actuel : VPS-1 2027, 2 vCore, 4 Go, 40 Go, **Debian 12 seule**, sans image Docker ni panneau. Le premier est à Beauharnois (Canada), faute de stock en Europe.

Si tu n'as plus la clé `~/.ssh/ovh_mat` :

```bash
ssh-keygen -t ed25519 -C "mat@mathieucasteras.fr" -f ~/.ssh/ovh_mat
```

Récupère le mot de passe `debian` sur le lien du mail OVH, puis pose la clé. OVH impose de changer ce mot de passe à la première connexion : réponds à ses questions, puis reconnecte-toi.

```bash
ssh-copy-id -i ~/.ssh/ovh_mat.pub debian@<IP>
```

Si tu réinstalles une machine à la même IP, oublie d'abord l'ancienne empreinte :

```bash
ssh-keygen -R <IP>
```

## 2. Créer l'utilisateur `mat`

Connecté en `debian` :

```bash
ssh -i ~/.ssh/ovh_mat debian@<IP>
```

```bash
sudo adduser mat && sudo usermod -aG sudo mat && sudo mkdir -p /home/mat/.ssh && sudo cp ~/.ssh/authorized_keys /home/mat/.ssh/ && sudo chown -R mat:mat /home/mat/.ssh && sudo chmod 700 /home/mat/.ssh
```

`adduser` demande un mot de passe pour `mat` : c'est celui de `sudo` au quotidien. Note l'uid, il servira à l'étape 7 (`debian` a le 1000, `mat` le 1001) :

```bash
id mat
```

Sur le Mac, dans `~/.ssh/config` (remplace `<IP>` ou l'ancienne valeur) :

```
Host vps
  HostName <IP>
  User mat
  IdentityFile ~/.ssh/ovh_mat
```

Vérifie, **sans fermer la session `debian`** :

```bash
ssh vps 'whoami && hostname'
```

## 3. Préparer la machine

Dans un terminal connecté à la VM (`ssh vps`) :

```bash
sudo apt update && sudo apt -y upgrade && sudo apt -y install ufw fail2ban unattended-upgrades git curl
```

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

```bash
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker mat
```

Node 22, pour construire le front de la veille (Debian 12 en fournit un trop ancien) :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt -y install nodejs
```

Coupe les mots de passe SSH. Modifier `sshd_config` **ne suffit pas** : le fichier `50-cloud-init.conf` d'OVH passerait avant. Il faut un fichier qui se lit encore plus tôt :

```bash
sudo sh -c 'printf "PasswordAuthentication no\nKbdInteractiveAuthentication no\n" > /etc/ssh/sshd_config.d/00-durcissement.conf' && sudo systemctl restart ssh
```

Déconnecte-toi et reconnecte-toi pour que le groupe `docker` soit pris en compte. Puis, depuis le Mac :

```bash
ssh vps 'docker ps && docker compose version && node --version'
```

La VM ne doit plus proposer que `publickey` :

```bash
ssh -v -o BatchMode=yes -o PubkeyAuthentication=no mat@<IP> true 2>&1 | grep "can continue"
```

## 4. Le DNS

Dans la zone OVH de `mathieucasteras.fr`, supprime les `A`/`AAAA` posés par défaut sur la racine, puis crée :

| Type | Sous-domaine | Cible |
| --- | --- | --- |
| A | *(vide)* | IPv4 du VPS |
| AAAA | *(vide)* | IPv6 du VPS |
| A | `www` | IPv4 du VPS |
| AAAA | `www` | IPv6 du VPS |
| A | `veille` | IPv4 du VPS |
| AAAA | `veille` | IPv6 du VPS |
| A | `allium` | IPv4 du VPS |
| AAAA | `allium` | IPv6 du VPS |

Attends la propagation, sinon Let's Encrypt échouera :

```bash
dig +short mathieucasteras.fr www.mathieucasteras.fr veille.mathieucasteras.fr allium.mathieucasteras.fr
```

```bash
dig +short AAAA mathieucasteras.fr
```

Vérifie que l'IPv6 répond sur la VM. Si ce n'est pas le cas, retire les `AAAA` :

```bash
ssh vps 'ip -6 addr show scope global; curl -6 -s -m 10 -o /dev/null -w "%{http_code}\n" https://github.com'
```

## 5. Donner à la VM l'accès à GitHub

GitHub refuse la même clé de déploiement sur deux dépôts : il en faut une par dépôt, avec un alias SSH pour chacune. Les clés se créent **sur la VM**.

```bash
ssh vps 'ssh-keygen -q -t ed25519 -N "" -C "vps site" -f ~/.ssh/id_github && ssh-keygen -q -t ed25519 -N "" -C "vps veille" -f ~/.ssh/id_github_veille && ssh-keygen -q -t ed25519 -N "" -C "vps allium" -f ~/.ssh/id_github_allium && hostname && cat ~/.ssh/id_github.pub ~/.ssh/id_github_veille.pub ~/.ssh/id_github_allium.pub'
```

Ajoute chaque clé dans *Settings › Deploy keys › Add deploy key*, « Allow write access » décoché. Retire d'abord celles de l'ancienne machine.

| Clé | Dépôt | Adresse |
| --- | --- | --- |
| `vps site` | `MCasteras/mathieucasteras.fr` | https://github.com/MCasteras/mathieucasteras.fr/settings/keys |
| `vps veille` | `MCasteras/veille-fde` | https://github.com/MCasteras/veille-fde/settings/keys |
| `vps allium` | `MCasteras/Allium` | https://github.com/MCasteras/Allium/settings/keys |

Puis configure les alias et teste :

```bash
ssh vps 'printf "Host github-site\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_github\n  IdentitiesOnly yes\nHost github-veille\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_github_veille\n  IdentitiesOnly yes\nHost github-allium\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_github_allium\n  IdentitiesOnly yes\n" >> ~/.ssh/config && chmod 600 ~/.ssh/config'
```

```bash
ssh vps 'ssh -o StrictHostKeyChecking=accept-new -T github-site; ssh -o StrictHostKeyChecking=accept-new -T github-veille; ssh -o StrictHostKeyChecking=accept-new -T github-allium; git ls-remote git@github-veille:MCasteras/veille-fde.git HEAD'
```

Chaque alias doit nommer **son** dépôt : `Hi MCasteras/mathieucasteras.fr!`, `Hi MCasteras/veille-fde!`, puis `Hi MCasteras/Allium!`. La dernière commande doit afficher un commit.

## 6. Cloner et lancer Caddy

Les trois clones doivent exister **avant** le premier démarrage : Caddy monte le dossier `deploy/caddy` de chacun, et un dossier absent serait créé vide, au nom de root, par Docker.

```bash
ssh vps 'git clone git@github-site:MCasteras/mathieucasteras.fr.git /home/mat/mathieucasteras.fr && git clone git@github-veille:MCasteras/veille-fde.git /home/mat/veille-fde && git clone git@github-allium:MCasteras/Allium.git /home/mat/allium'
```

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/serveur && printf "DOMAINE=mathieucasteras.fr\nCHEMIN_VEILLE=/home/mat/veille-fde\nCHEMIN_ALLIUM=/home/mat/allium\n" > .env && chmod 600 .env && docker network create web && docker volume create site_dist && docker compose up -d'
```

Vérifie depuis le Mac. **À ce stade, 404 et 502 sont normaux** : ce qui compte est `ssl=0`, qui prouve que le certificat est valide.

```bash
for u in https://mathieucasteras.fr https://www.mathieucasteras.fr https://veille.mathieucasteras.fr https://allium.mathieucasteras.fr; do curl -s -o /dev/null -m 15 -w "$u %{http_code} ssl=%{ssl_verify_result}\n" $u; done
```

## 7. Déployer la veille

**a. Le secret du webhook, commun à la veille et au site.** Cette commande crée les deux `.env` sans jamais l'afficher. `HOTE_UID` reçoit l'uid de `mat`.

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && cp .env.example .env && chmod 600 .env && S=$(openssl rand -hex 32) && sed -i "s|^HOTE_UID=.*|HOTE_UID=$(id -u)|; s|^VITRINE_WEBHOOK=.*|VITRINE_WEBHOOK=https://mathieucasteras.fr/rebuild|; s|^VITRINE_WEBHOOK_SECRET=.*|VITRINE_WEBHOOK_SECRET=$S|; s|^SEARXNG_SECRET=.*|SEARXNG_SECRET=$(openssl rand -hex 32)|" .env && printf "VITRINE_API=https://veille.mathieucasteras.fr\nVITRINE_OBLIGATOIRE=1\nSITE_URL=https://mathieucasteras.fr\nSITE_WEBHOOK_SECRET=%s\nHEURE_NUIT=03:30\n" "$S" > /home/mat/mathieucasteras.fr/deploy/.env && chmod 600 /home/mat/mathieucasteras.fr/deploy/.env'
```

**b. Tes clés et ton mot de passe,** à saisir toi-même, dans un vrai terminal :

```bash
ssh -t vps nano /home/mat/veille-fde/deploy/.env
```

| Ligne | Quoi mettre |
| --- | --- |
| `MOT_DE_PASSE_INITIAL=` | Ton mot de passe de connexion : 8 caractères minimum, sans espace ni `#`. Ignoré si la base en contient déjà un. |
| `GEMINI_API_KEY=` | La clé du fournisseur actif, indiqué par `actif:` dans `backend/config/modeles.yaml` (Gemini aujourd'hui). |
| `GITHUB_TOKEN=` | Facultatif, un jeton en lecture pour les releases. |

Le titre de `nano` doit afficher `/home/mat/…`. Enregistre avec `Ctrl+O` puis Entrée, quitte avec `Ctrl+X`.

**c. Construire et lancer.** `data/` et `ssh/` doivent être créés **par `mat`** avant le démarrage, sinon Docker les crée au nom de root et le conteneur ne peut plus y écrire.

```bash
ssh vps 'cd /home/mat/veille-fde/frontend && npm ci && npm run build && cd ../deploy && mkdir -p ../data ssh && chmod 700 ssh'
```

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && docker compose up -d --build && sleep 20 && docker compose ps && docker compose logs --tail 8 app && ls -la ../data'
```

Les fichiers de `data/` doivent appartenir à `mat`.

**d. Vérifier :**

```bash
curl -s https://veille.mathieucasteras.fr/api/sante
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://veille.mathieucasteras.fr/api/items
```

Attendu : `{"ok":true,…}`, puis `401`, car les routes privées refusent sans session.

## 8. Remettre les données

Une seule des deux méthodes.

### Depuis la sauvegarde de l'étape 0 (à privilégier)

C'est la seule qui garde tout : mot de passe, sessions, usage, réglages.

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && docker compose stop app worker && rm -f ../data/veille.db ../data/veille.db-wal ../data/veille.db-shm'
```

```bash
scp ~/sauvegarde-vps/veille.db vps:/home/mat/veille-fde/data/veille.db
```

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && docker compose up -d && sleep 10 && docker compose ps'
```

### Depuis le dépôt de données

À utiliser si l'ancienne machine est perdue. Il manque les textes collés, les adresses des flux e-mail, l'usage et le mot de passe. Le dépôt est privé, on passe donc par le Mac.

```bash
git clone --depth 1 https://github.com/MCasteras/veille-fde-data.git /tmp/veille-data
```

`COPYFILE_DISABLE=1` est indispensable : sans lui, le `tar` de macOS ajoute des fichiers `._*.json` qui font échouer l'import.

```bash
ssh vps 'rm -rf ~/import-veille && mkdir -p ~/import-veille && chmod 700 ~/import-veille' && COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C /tmp/veille-data -czf - data | ssh vps 'tar -C ~/import-veille -xzf -'
```

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && docker compose run --rm --no-deps -v /home/mat/veille-fde/scripts:/srv/scripts:ro -v /home/mat/import-veille:/import:ro app python /srv/scripts/import_export.py --data /import/data --db /data/veille.db; rm -rf /home/mat/import-veille'
```

```bash
rm -rf /tmp/veille-data
```

Le script affiche les documents reçus et ceux en base : les totaux doivent correspondre (761 le 2 novembre).

## 9. Déployer le site

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/deploy && docker compose up -d --build && sleep 30 && docker compose logs --tail 5 site-builder'
```

Attendu : `démarrage : site reconstruit en … s`.

Le webhook, depuis la VM, sans afficher le secret. Attendu : `401`, puis `202` :

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/deploy && S=$(grep ^SITE_WEBHOOK_SECRET= .env | cut -d= -f2) && curl -s -o /dev/null -X POST -w "%{http_code}\n" https://mathieucasteras.fr/rebuild && curl -s -o /dev/null -X POST -H "Authorization: Bearer $S" -w "%{http_code}\n" https://mathieucasteras.fr/rebuild'
```

## 9 bis. Déployer Allium

La procédure complète est dans le dépôt Allium, `deploy/README.md` (le fichier fait foi) ; voici l'enchaînement, depuis le Mac. Le lot 0 vit sur la branche `claude/funny-bell-fs0e0w` tant qu'il n'est pas fusionné dans `main`.

```bash
ssh vps 'cd /home/mat/allium && git checkout claude/funny-bell-fs0e0w && cd deploy && cp -n .env.example .env && chmod 600 .env && sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env && docker compose up -d --build && sleep 20 && docker compose ps'
```

Le premier compte, administrateur ; le mot de passe est demandé au terminal :

```bash
ssh -t vps 'cd /home/mat/allium/deploy && docker compose exec allium-app python -m allium.comptes creer-admin --email <ton e-mail> --nom Mathieu --foyer "<nom de ton foyer>"'
```

Brancher le Caddy partagé (le montage du fragment et le bloc d'hôte sont déjà dans ce dépôt) :

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/serveur && docker compose up -d && ./reload.sh'
```

Sauvegarde nocturne : `cron` n'est pas installé par défaut sur l'image Debian 12 d'OVH. Dans un vrai terminal :

```bash
ssh -t vps 'sudo apt -y install cron'
```

```bash
ssh vps '( crontab -l 2>/dev/null; echo "15 3 * * * /home/mat/allium/deploy/sauvegarde.sh" ) | sort -u | crontab - && crontab -l'
```

Puis lancer le script une fois à la main et tester une restauration dans une base à part (`deploy/README.md` § « Sauvegarder et restaurer » du dépôt Allium). La copie hors VM est reportée (décision 13 d'Allium) : comme pour la veille, les copies restent sur la machine.

Vérifier :

```bash
curl -s https://allium.mathieucasteras.fr/api/sante && curl -s -o /dev/null -w "%{http_code}\n" https://allium.mathieucasteras.fr/api/docs
```

Attendu : `{"ok":true,…}`, puis `404` (la documentation de l'API n'est pas servie).

## 10. Vérifier le tout

```bash
for p in / /veille/ /outils/veille/ /sources/ /veille/posts.xml /sitemap-index.xml /theme.js /og/defaut.png; do curl -s -o /dev/null -w "%{http_code} $p\n" https://mathieucasteras.fr$p; done
```

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.mathieucasteras.fr/
```

```bash
curl -sI https://mathieucasteras.fr/ | grep -iE "content-security|strict-transport|x-frame"
```

```bash
curl -s https://veille.mathieucasteras.fr/api/vitrine
```

```bash
curl -sI https://allium.mathieucasteras.fr/ | grep -iE "content-security|strict-transport|x-frame"
```

Puis à la main :
1. Ouvre https://mathieucasteras.fr et vérifie qu'aucun bandeau « jeu d'exemple » n'apparaît.
2. Connecte-toi à https://veille.mathieucasteras.fr et vérifie que tes articles sont là.
3. Dans Réglages › Modèles, lance « Tester le fournisseur actif ».
4. Dans Réglages › Travaux, lance « Relever maintenant » et lis le journal.
5. Bascule un document en « Vitrine » et vérifie que le site le montre dans les cinq minutes.
6. Connecte-toi à https://allium.mathieucasteras.fr avec le compte admin ; l'onglet Réseau du navigateur ne doit montrer aucune requête vers un tiers (polices comprises).

## 11. Finir la sécurisation

Quand tout marche, verrouille le compte `debian`, dans un vrai terminal :

```bash
ssh -t vps 'sudo passwd -l debian && sudo deluser debian sudo && sudo rm -f /home/debian/.ssh/authorized_keys'
```

Vérifie ensuite que `ssh vps` marche toujours. En cas de problème, il reste le KVM dans le manager OVH.

Si tu changes de VM, retire de GitHub les clés de déploiement de l'ancienne, puis supprime `~/sauvegarde-vps` :

```bash
rm -rf ~/sauvegarde-vps
```

## Mises à jour courantes

Le code se pousse d'abord sur GitHub ; la VM ne voit que ce qui y est.

**Le site** (nouveau code, nouvelle note) :

```bash
ssh vps /home/mat/mathieucasteras.fr/deploy/update.sh
```

**La veille :**

```bash
ssh vps 'cd /home/mat/veille-fde && git pull --ff-only && cd frontend && npm ci && npm run build && cd ../deploy && docker compose up -d --build'
```

**Allium** (les migrations passent au démarrage du conteneur) :

```bash
ssh vps 'cd /home/mat/allium && git pull --ff-only && cd deploy && docker compose up -d --build'
```

Si l'API publique change, reconstruis ensuite le site. Le webhook ne suffit pas toujours, car il saute la reconstruction quand les documents exposés n'ont pas changé :

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/deploy && docker compose restart site-builder'
```

**Une variable d'un `.env` modifiée :** `restart` ne relit pas le fichier, il faut `up -d`.

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && docker compose up -d'
```

**Caddy** (`Caddyfile` ou un fragment modifié), sans coupure. Ne jamais utiliser `down` pour recharger :

```bash
ssh vps /home/mat/mathieucasteras.fr/serveur/reload.sh
```

**Les journaux :**

```bash
ssh vps 'cd /home/mat/veille-fde/deploy && docker compose logs --tail 50 app worker'
```

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/deploy && docker compose logs --tail 50 site-builder'
```

```bash
ssh vps 'cd /home/mat/mathieucasteras.fr/serveur && docker compose logs --tail 50 caddy'
```

```bash
ssh vps 'cd /home/mat/allium/deploy && docker compose logs --tail 50 allium-app'
```

## Pannes déjà rencontrées

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `nano` affiche `/Users/mathieu/…`, `Error writing … No such file or directory` | `~` remplacé par le Mac | Écrire `/home/mat/…` en entier |
| Une commande donne un résultat sur le Mac (`Your identification has been saved in /Users/…`) | Lancée hors de la VM | La préfixer par `ssh vps '…'` ; défaire ce qui a été créé sur le Mac |
| `git` en SSH échoue sur le Mac, ou `Hi MCasteras/mathieucasteras.fr` partout | Bloc `Host github.com` ajouté à la config du Mac | Le retirer de `~/.ssh/config` |
| `Key is already in use` sur GitHub | Une clé par dépôt seulement | Une clé et un alias par dépôt (étape 5) |
| `github-veille` répond avec le nom du site, `git ls-remote` refuse | Clé ajoutée au mauvais dépôt | La repérer par son empreinte (`ssh-keygen -lf`), la déplacer |
| Le SSH accepte encore les mots de passe | `50-cloud-init.conf` passe avant `sshd_config` | Fichier `00-durcissement.conf` (étape 3) |
| `sudo` demande un mot de passe depuis `ssh vps '…'` et échoue | Pas de terminal | `ssh -t vps '…'`, dans un vrai terminal |
| `You are required to change your password` | Politique OVH à la première connexion | Répondre, puis se reconnecter |
| Le conteneur de la veille ne peut pas écrire dans `data/` | `HOTE_UID` différent de `id -u`, ou dossier créé par root | Corriger `.env`, `sudo chown -R mat:mat data deploy/ssh`, `docker compose up -d --build` |
| `UnicodeDecodeError` à l'import | Fichiers `._*.json` du `tar` macOS | `COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata` |
| `git pull` refuse à cause de `tsconfig.tsbuildinfo` | Fichier suivi par Git et modifié par chaque build | `git checkout frontend/tsconfig.tsbuildinfo`, puis relancer |
| Le push semble fait mais `git pull` ne récupère rien | Le premier `&&` a échoué | Comparer `git ls-remote` et `git rev-parse HEAD` |
| Le site est vide alors que des documents existent | Drapeau « Vitrine » non posé | Le poser dans l'application |
| La recherche web des agents échoue | SearXNG arrêté ou `SEARXNG_SECRET` vide | `docker compose ps`, puis vérifier `.env` |
| Connexion à la veille bloquée 5 minutes | Limite de tentatives partagée entre tous les clients IPv6 | Attendre 5 minutes (voir ci-dessous) |
| `crontab: command not found` | `cron` absent de l'image Debian 12 d'OVH | `ssh -t vps 'sudo apt -y install cron'` |
| `git@github.com: Permission denied` sur la VM | Pas de clé pour `github.com` : une clé et un alias par dépôt | Utiliser l'alias (`git@github-allium:…`), étape 5 |
| `caddy validate` : `File to import not found: /etc/caddy/sites/<outil>/…` alors que le fichier existe sur la VM | Le dossier `deploy/caddy` du clone a été supprimé puis recréé (par exemple un `git checkout` vers une branche qui ne l'a pas) : le montage de Caddy pointe sur l'ancien dossier, vide | `cd serveur && docker compose up -d --force-recreate caddy && ./reload.sh` (quelques secondes de coupure) |

## Ce qui n'est pas encore réglé

- **Sauvegardes Git :** `DEPOTS_DONNEES` cite deux dépôts, et aucune clé d'écriture n'est posée. La sauvegarde du vendredi échoue donc pour l'instant. Les copies nocturnes restent sur la même machine : l'étape 0 est aujourd'hui ta seule protection contre la perte du VPS.
- **Limite de connexion en IPv6 :** Docker fait apparaître tous les clients IPv6 avec l'adresse `172.18.0.1`.
- **Copies d'Allium :** même situation, elles restent dans `/home/mat/allium/data/sauvegardes/` (copie hors VM reportée, décision 13 du dépôt Allium).
- **Certificats :** le volume `caddy_data` n'est pas sauvegardé. Sur une nouvelle machine, Caddy redemande simplement ses certificats ; Let's Encrypt limite ces demandes, donc évite de réinstaller plusieurs fois de suite.
- **Ce guide** a été écrit d'après le déploiement réel mais n'a pas été rejoué de zéro, notamment les étapes 0 et 8 (restauration) et 11.
