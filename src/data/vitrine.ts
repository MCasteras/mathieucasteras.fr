/**
 * Lecture de la vitrine publique de Veille FDE : `GET <VITRINE_API>/api/vitrine*`, en lecture seule.
 * Le site ne possède aucune donnée de veille : tout vient de ces six routes, ou du jeu d'exemple
 * `fixtures/vitrine/*.json` (clairement factice) quand l'API n'est pas joignable au build.
 * En production (`VITRINE_OBLIGATOIRE=1`) un repli sur le jeu d'exemple est une erreur.
 *
 * Contrat : `veille-fde/docs/14-site-vitrine.md § 2`. Ce module tourne en Node (loaders et tests) : pas d'API Astro ici.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const VERSION_ATTENDUE = 1;
export const ROUTES = ['index', 'posts', 'fiches', 'focus', 'sources', 'stats'] as const;
export type Route = (typeof ROUTES)[number];

export interface Vitrine {
  /** D'où viennent les données : l'API, ou le jeu d'exemple. */
  origine: 'api' | 'fixtures';
  index: { version: number; comptes: Record<string, number>; modifie_le: string | null };
  posts: unknown[];
  fiches: unknown[];
  focus: unknown[];
  sources: unknown[];
  stats: Record<string, unknown>;
}

export interface Options {
  /** Base de l'API, sans barre finale (`https://veille.exemple.fr`). Défaut : `VITRINE_API`. */
  api?: string;
  /** Vrai : refuser le jeu d'exemple. Défaut : `VITRINE_OBLIGATOIRE` vaut `1`, `true` ou `oui`. */
  obligatoire?: boolean;
  /** Dossier du jeu d'exemple. Défaut : `fixtures/vitrine` à la racine du projet. */
  fixtures?: string;
  fetch?: typeof fetch;
  avertir?: (message: string) => void;
}

export class VitrineIndisponible extends Error {}

const USER_AGENT = 'mathieucasteras.fr (build statique)';
const DELAI_MS = 60_000;

function chemin(route: Route): string {
  return route === 'index' ? '/api/vitrine' : `/api/vitrine/${route}`;
}

function vrai(valeur: string | undefined): boolean {
  return ['1', 'true', 'oui', 'yes'].includes((valeur ?? '').trim().toLowerCase());
}

async function lireRoute(base: string, route: Route, fetcher: typeof fetch): Promise<unknown> {
  const url = base.replace(/\/+$/, '') + chemin(route);
  // Une API qui ne répond plus ne doit pas figer le build, donc toutes les reconstructions suivantes.
  const reponse = await fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!reponse.ok) throw new VitrineIndisponible(`${url} : HTTP ${reponse.status}`);
  return reponse.json();
}

function verifierVersion(index: unknown, origine: string): asserts index is Vitrine['index'] {
  const version = (index as { version?: unknown } | null)?.version;
  if (version !== VERSION_ATTENDUE) {
    throw new Error(`vitrine (${origine}) : schéma version ${String(version)}, le site attend la version ${VERSION_ATTENDUE}`);
  }
}

/** Lit les six routes de l'API. Lève `VitrineIndisponible` si une route ne répond pas, `Error` si le schéma n'est pas celui attendu. */
export async function lireDepuisApi(base: string, fetcher: typeof fetch = fetch): Promise<Vitrine> {
  const index = await lireRoute(base, 'index', fetcher);
  verifierVersion(index, base);
  const [posts, fiches, focus, sources, stats] = await Promise.all(
    (['posts', 'fiches', 'focus', 'sources', 'stats'] as const).map((r) => lireRoute(base, r, fetcher)),
  );
  return { origine: 'api', index, posts: liste(posts), fiches: liste(fiches), focus: liste(focus), sources: liste(sources), stats: objet(stats) };
}

/** Lit le jeu d'exemple `fixtures/vitrine/*.json`. */
export async function lireDepuisFixtures(dossier = path.resolve('fixtures/vitrine')): Promise<Vitrine> {
  const lire = async (route: Route) => JSON.parse(await readFile(path.join(dossier, `${route}.json`), 'utf8')) as unknown;
  const index = await lire('index');
  verifierVersion(index, dossier);
  return {
    origine: 'fixtures',
    index,
    posts: liste(await lire('posts')),
    fiches: liste(await lire('fiches')),
    focus: liste(await lire('focus')),
    sources: liste(await lire('sources')),
    stats: objet(await lire('stats')),
  };
}

/**
 * Point d'entrée du build : l'API si `VITRINE_API` est définie et répond, sinon le jeu d'exemple,
 * sauf si le repli est interdit (`VITRINE_OBLIGATOIRE`), auquel cas le build échoue.
 */
export async function lireVitrine(options: Options = {}): Promise<Vitrine> {
  const api = (options.api ?? process.env.VITRINE_API ?? '').trim();
  const obligatoire = options.obligatoire ?? vrai(process.env.VITRINE_OBLIGATOIRE);
  const avertir = options.avertir ?? ((m) => console.warn(`[vitrine] ${m}`));

  if (api) {
    try {
      return await lireDepuisApi(api, options.fetch ?? fetch);
    } catch (e) {
      if (obligatoire || !(e instanceof VitrineIndisponible || e instanceof TypeError)) throw e;
      avertir(`${api} injoignable (${(e as Error).message}) : repli sur le jeu d'exemple`);
    }
  } else {
    if (obligatoire) throw new VitrineIndisponible('VITRINE_API absente alors que VITRINE_OBLIGATOIRE est posée');
    avertir("VITRINE_API absente : construction sur le jeu d'exemple fixtures/vitrine");
  }
  return lireDepuisFixtures(options.fixtures);
}

/** Une seule lecture par processus de build, partagée entre les loaders des collections. */
export function vitrineDuBuild(): Promise<Vitrine> {
  const g = globalThis as { __vitrine?: Promise<Vitrine> };
  g.__vitrine ??= lireVitrine();
  return g.__vitrine;
}

function liste(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function objet(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
