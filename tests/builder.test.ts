/** site-builder : refus sans secret, 202, un build à la fois, un seul en attente, saut si la vitrine n'a pas changé. */
import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { creerBuilder } from '../deploy/builder/builder.mjs';

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

function faux(opts: { modifie?: string | null; duree?: number; echoue?: boolean } = {}) {
  const builds: string[] = [];
  const lignes: string[] = [];
  const b = creerBuilder({
    secret: 'secret-test',
    journal: (l: string) => lignes.push(l),
    lireModifieLe: async () => opts.modifie ?? '2026-10-30T07:12:00Z',
    construire: async ({ motif }: { motif: string }) => {
      await attendre(opts.duree ?? 20);
      if (opts.echoue) throw new Error('astro a planté');
      builds.push(motif);
    },
  });
  return { b, builds, lignes };
}

let serveur: http.Server | undefined;
afterEach(() => serveur?.close());

async function ecouter(b: ReturnType<typeof creerBuilder>): Promise<string> {
  serveur = http.createServer(b.traiterRequete);
  await new Promise<void>((r) => serveur!.listen(0, '127.0.0.1', r));
  const { port } = serveur.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

describe('file de reconstruction', () => {
  it('construit, puis saute quand modifie_le est inchangé, puis reconstruit si force', async () => {
    const { b, builds } = faux();
    expect(b.demander({ motif: 'un' })).toBe('lance');
    await b.attendre();
    expect(builds).toEqual(['un']);
    b.demander({ motif: 'deux' });
    await b.attendre();
    expect(builds).toEqual(['un']);
    expect(b.etat().dernier).toMatchObject({ saute: true, ok: true, motif: 'deux' });
    b.demander({ motif: 'trois', force: true });
    await b.attendre();
    expect(builds).toEqual(['un', 'trois']);
  });

  it('sérialise : un build en cours, un seul programmé, les suivants fusionnés', async () => {
    const { b, builds } = faux({ duree: 60 });
    expect(b.demander({ motif: 'a', force: true })).toBe('lance');
    expect(b.demander({ motif: 'b', force: true })).toBe('programme');
    expect(b.demander({ motif: 'c', force: true })).toBe('deja_programme');
    expect(b.etat()).toMatchObject({ en_cours: true, programme: true });
    await b.attendre();
    expect(builds).toEqual(['a', 'b']);
    expect(b.etat()).toMatchObject({ en_cours: false, programme: false });
  });

  it('note un échec sans casser la file, et le dernier réussi reste celui d’avant', async () => {
    const { b, lignes } = faux({ echoue: true });
    b.demander({ motif: 'x', force: true });
    await b.attendre();
    expect(b.etat().dernier).toMatchObject({ ok: false, erreur: 'astro a planté' });
    expect(b.etat().dernier_reussi).toBeNull();
    expect(lignes.at(-1)).toMatch(/ÉCHEC/);
  });

  it('construit quand même si modifie_le est illisible', async () => {
    const builds: string[] = [];
    const b = creerBuilder({
      secret: 's',
      journal: () => {},
      lireModifieLe: async () => { throw new Error('HTTP 503'); },
      construire: async ({ motif }: { motif: string }) => { builds.push(motif); },
    });
    b.demander({ motif: 'y' });
    await b.attendre();
    expect(builds).toEqual(['y']);
  });
});

describe('HTTP', () => {
  it('refuse POST /rebuild sans le bon jeton, accepte avec, répond 202 tout de suite', async () => {
    const { b, builds } = faux({ duree: 50 });
    const base = await ecouter(b);
    expect((await fetch(`${base}/rebuild`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${base}/rebuild`, { method: 'POST', headers: { Authorization: 'Bearer faux' } })).status).toBe(401);
    const t0 = Date.now();
    const r = await fetch(`${base}/rebuild?force=1`, { method: 'POST', headers: { Authorization: 'Bearer secret-test', 'User-Agent': 'VeilleFDE/2.0' } });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ resultat: 'lance' });
    expect(Date.now() - t0).toBeLessThan(40);
    const r2 = await fetch(`${base}/rebuild`, { method: 'POST', headers: { Authorization: 'Bearer secret-test' } });
    expect(await r2.json()).toEqual({ resultat: 'programme' });
    await b.attendre();
    expect(builds[0]).toBe('webhook VeilleFDE/2.0');
  });

  it('GET /sante décrit l’état ; le reste est 404', async () => {
    const { b } = faux();
    const base = await ecouter(b);
    b.demander({ force: true, motif: 'démarrage' });
    await b.attendre();
    const sante = await (await fetch(`${base}/sante`)).json();
    expect(sante.dernier).toMatchObject({ ok: true, motif: 'démarrage', modifie_le: '2026-10-30T07:12:00Z' });
    expect((await fetch(`${base}/autre`)).status).toBe(404);
    expect((await fetch(`${base}/rebuild`)).status).toBe(404);
  });
});
