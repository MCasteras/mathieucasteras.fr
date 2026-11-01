/**
 * `site-builder` : construit le site dans le volume `site_dist` et écoute `POST /rebuild` sur le réseau `web`.
 * Déclencheurs : démarrage (toujours), webhook de la veille (saute si la vitrine n'a pas changé), une fois par nuit.
 * Chaque build va dans /srv/site/releases/<horodatage>/ puis le lien symbolique /srv/site/current bascule d'un coup :
 * un build raté ne change rien à ce que Caddy sert. Journal dans /data/journal.log et sur la sortie standard.
 *
 * Variables : SITE_WEBHOOK_SECRET (obligatoire), VITRINE_API, VITRINE_OBLIGATOIRE, SITE_URL (passées au build),
 * SITE_RACINE (/srv/site), SITE_DONNEES (/data), PORT (8080), HEURE_NUIT (03:30, Europe/Paris), RELEASES_GARDEES (2).
 */
import { spawn } from 'node:child_process';
import { appendFile, cp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerBuilder } from './builder.mjs';

const env = process.env;
const PROJET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RACINE = env.SITE_RACINE || '/srv/site';
const DONNEES = env.SITE_DONNEES || '/data';
const PORT = Number(env.PORT || 8080);
const HEURE_NUIT = env.HEURE_NUIT || '03:30';
const GARDEES = Math.max(1, Number(env.RELEASES_GARDEES || 2));
const SECRET = env.SITE_WEBHOOK_SECRET;

if (!SECRET) {
  console.error('SITE_WEBHOOK_SECRET manquant : refus de démarrer (le webhook serait ouvert à tous).');
  process.exit(1);
}

await mkdir(path.join(RACINE, 'releases'), { recursive: true });
await mkdir(DONNEES, { recursive: true });
const JOURNAL = path.join(DONNEES, 'journal.log');
const ETAT = path.join(DONNEES, 'builds.json');

function journal(ligne) {
  console.log(ligne);
  appendFile(JOURNAL, ligne + '\n').catch(() => {});
}

async function lireModifieLe() {
  const base = (env.VITRINE_API || '').replace(/\/+$/, '');
  if (!base) return null;
  const r = await fetch(`${base}/api/vitrine`, { headers: { Accept: 'application/json', 'User-Agent': 'site-builder' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return typeof j?.modifie_le === 'string' ? j.modifie_le : null;
}

function astroBuild(outDir) {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(path.join(PROJET, 'node_modules/.bin/astro'), ['build', '--outDir', outDir], { cwd: PROJET, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    p.stdout.on('data', (d) => (sortie += d));
    p.stderr.on('data', (d) => (sortie += d));
    p.on('error', rejeter);
    p.on('close', (code) => {
      if (code === 0) return resoudre();
      const fin = sortie.trim().split('\n').slice(-12).join('\n');
      rejeter(new Error(`astro build : code ${code}\n${fin}`));
    });
  });
}

async function construire() {
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
  const release = path.join(RACINE, "releases", horodatage);
  // Astro déplace ses fichiers par rename, impossible vers le volume (autre système de fichiers) : on construit dans
  // le conteneur puis on copie la release d'un bloc. Rien n'arrive dans le volume si le build échoue.
  const tmp = path.join(PROJET, ".build-tmp");
  await rm(tmp, { recursive: true, force: true });
  await astroBuild(tmp);
  await cp(tmp, release, { recursive: true });
  await rm(tmp, { recursive: true, force: true });
  // Bascule atomique : nouveau lien temporaire, puis rename par-dessus `current`.
  const lien = path.join(RACINE, `.current-${horodatage}`);
  await symlink(path.join("releases", horodatage), lien);
  await rename(lien, path.join(RACINE, "current"));
  // Ménage : on garde les dernières releases seulement.
  const toutes = (await readdir(path.join(RACINE, 'releases'))).sort();
  for (const r of toutes.slice(0, Math.max(0, toutes.length - GARDEES))) await rm(path.join(RACINE, 'releases', r), { recursive: true, force: true });
}

let historique = [];
try {
  historique = JSON.parse(await readFile(ETAT, 'utf8'));
} catch {}

const builder = creerBuilder({
  construire,
  lireModifieLe,
  secret: SECRET,
  historique,
  journal: (l) => {
    journal(l);
    writeFile(ETAT, JSON.stringify(builder.etat().builds, null, 1)).catch(() => {});
  },
});

http.createServer(builder.traiterRequete).listen(PORT, () => journal(`${new Date().toISOString()}  site-builder à l'écoute sur :${PORT}, site dans ${RACINE}`));

// Démarrage : on construit toujours (nouveau code ou nouvelles notes après un `git pull` + `up --build`).
builder.demander({ force: true, motif: 'démarrage' });

// Nuit : filet de sécurité, à HEURE_NUIT heure de Paris, une fois par jour.
const heureParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' });
let derniereNuit = null;
setInterval(() => {
  const maintenant = new Date();
  const jour = jourParis.format(maintenant);
  if (heureParis.format(maintenant).replace('h', ':') === HEURE_NUIT && derniereNuit !== jour) {
    derniereNuit = jour;
    builder.demander({ force: true, motif: 'nuit' });
  }
}, 30_000);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    journal(`${new Date().toISOString()}  ${signal} : attente de la fin du build en cours`);
    await builder.attendre();
    process.exit(0);
  });
}
