/**
 * Cœur de `site-builder`, sans dépendance : une file de reconstruction (un build à la fois, un seul en attente),
 * le saut quand la vitrine n'a pas changé, et le traitement HTTP de `POST /rebuild` et `GET /sante`.
 * Ce qui touche au disque, à Astro ou au réseau est injecté (`construire`, `lireModifieLe`, `journal`) : testable seul.
 */
import { timingSafeEqual } from 'node:crypto';

const HISTORIQUE_MAX = 20;

/** Texte venu d'une requête, rendu sûr pour une ligne de journal : caractères de contrôle retirés, longueur bornée. */
const propre = (s) => String(s ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 120);

/**
 * @param {object} o
 * @param {(ctx: {modifie_le: string|null, motif: string}) => Promise<void>} o.construire  construit et met en ligne ; lève en cas d'échec
 * @param {() => Promise<string|null>} o.lireModifieLe  `modifie_le` de /api/vitrine (null si inconnu)
 * @param {string} o.secret  jeton attendu dans `Authorization: Bearer …`
 * @param {(ligne: string) => void} [o.journal]
 * @param {Array<object>} [o.historique]  derniers builds, rechargés depuis le disque au démarrage
 * @param {() => Date} [o.horloge]
 */
export function creerBuilder({ construire, lireModifieLe, secret, journal = console.log, historique = [], horloge = () => new Date() }) {
  if (!secret) throw new Error('secret manquant');
  let enCours = null; // Promise du build en cours
  let enAttente = null; // { force, motif } programmé pour la fin du build en cours
  const builds = [...historique].slice(-HISTORIQUE_MAX);

  const dernierReussi = () => [...builds].reverse().find((b) => b.ok);

  async function executer({ force, motif }) {
    const debut = horloge();
    let modifie_le = null;
    try {
      modifie_le = await lireModifieLe();
    } catch (e) {
      journal(`${debut.toISOString()}  ${motif} : modifie_le illisible (${e.message}), on construit quand même`);
    }
    const dernier = dernierReussi();
    if (!force && modifie_le && dernier && dernier.modifie_le === modifie_le) {
      const b = { le: debut.toISOString(), motif, ok: true, saute: true, modifie_le, duree_s: 0 };
      noter(b, `${motif} : vitrine inchangée (${modifie_le}), rien à reconstruire`);
      return b;
    }
    try {
      await construire({ modifie_le, motif });
      const b = { le: debut.toISOString(), motif, ok: true, saute: false, modifie_le, duree_s: duree(debut) };
      noter(b, `${motif} : site reconstruit en ${b.duree_s} s (vitrine ${modifie_le ?? 'inconnue'})`);
      return b;
    } catch (e) {
      const b = { le: debut.toISOString(), motif, ok: false, saute: false, modifie_le, duree_s: duree(debut), erreur: String(e?.message ?? e) };
      noter(b, `${motif} : ÉCHEC après ${b.duree_s} s : ${b.erreur}`);
      return b;
    }
  }

  function duree(debut) {
    return Math.round((horloge().getTime() - debut.getTime()) / 100) / 10;
  }

  function noter(b, ligne) {
    builds.push(b);
    if (builds.length > HISTORIQUE_MAX) builds.splice(0, builds.length - HISTORIQUE_MAX);
    journal(`${b.le}  ${ligne}`);
  }

  /** Demande une reconstruction. Retourne `lance`, `programme` (après le build en cours) ou `deja_programme`. */
  function demander({ force = false, motif = 'webhook' } = {}) {
    if (enCours) {
      if (enAttente) {
        enAttente.force ||= force;
        return 'deja_programme';
      }
      enAttente = { force, motif };
      return 'programme';
    }
    lancer({ force, motif });
    return 'lance';
  }

  function lancer(demande) {
    enCours = executer(demande).finally(() => {
      enCours = null;
      if (enAttente) {
        const suivant = enAttente;
        enAttente = null;
        lancer(suivant);
      }
    });
  }

  /** Attend la fin du build en cours et de celui qui est programmé (tests, arrêt propre). */
  async function attendre() {
    while (enCours) await enCours;
  }

  function etat() {
    return { en_cours: Boolean(enCours), programme: Boolean(enAttente), dernier: builds[builds.length - 1] ?? null, dernier_reussi: dernierReussi() ?? null, builds };
  }

  function autorise(req) {
    const attendu = Buffer.from(`Bearer ${secret}`);
    const recu = Buffer.from(String(req.headers['authorization'] ?? ''));
    return recu.length === attendu.length && timingSafeEqual(recu, attendu);
  }

  /** Gestionnaire `http.createServer` : POST /rebuild (202), GET /sante (200), sinon 404. */
  function traiterRequete(req, res) {
    const url = new URL(req.url ?? '/', 'http://site-builder');
    const json = (code, corps) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(corps));
    };
    if (req.method === 'POST' && url.pathname === '/rebuild') {
      if (!autorise(req)) return json(401, { erreur: 'jeton manquant ou invalide' });
      const force = ['1', 'true', 'oui'].includes(url.searchParams.get('force') ?? '');
      const motif = propre(url.searchParams.get('motif')) || `webhook ${propre(req.headers['user-agent'])}`.trim();
      return json(202, { resultat: demander({ force, motif }) });
    }
    if (req.method === 'GET' && url.pathname === '/sante') return json(200, etat());
    return json(404, { erreur: 'inconnu' });
  }

  return { demander, attendre, etat, traiterRequete };
}
