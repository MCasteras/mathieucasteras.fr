/** Résolution des données vitrine : API, repli sur le jeu d'exemple, refus en production, version du schéma. */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { lireDepuisFixtures, lireVitrine, VitrineIndisponible } from '../src/data/vitrine';

const FIXTURES = path.resolve('fixtures/vitrine');

/** Un faux `fetch` qui sert le jeu d'exemple comme le ferait l'API, avec des réponses modifiables par route. */
function fauxFetch(surcharge: Record<string, unknown | number> = {}): typeof fetch {
  return (async (entree: string | URL | Request) => {
    const url = String(entree instanceof Request ? entree.url : entree);
    const route = url.endsWith('/api/vitrine') ? 'index' : url.split('/api/vitrine/')[1];
    if (route in surcharge) {
      const v = surcharge[route];
      return typeof v === 'number' ? new Response('', { status: v }) : Response.json(v);
    }
    return new Response(await readFile(path.join(FIXTURES, `${route}.json`), 'utf8'), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

const silence = () => {};

describe('jeu d’exemple', () => {
  it('se lit et est marqué factice', async () => {
    const v = await lireDepuisFixtures(FIXTURES);
    expect(v.origine).toBe('fixtures');
    expect(v.index.version).toBe(1);
    expect(v.posts.length).toBe(v.index.comptes.posts);
    expect(v.fiches.length).toBe(v.index.comptes.fiches);
    expect(v.focus.length).toBe(v.index.comptes.focus);
    for (const p of v.posts as Array<{ texte: string }>) expect(p.texte).toContain('[EXEMPLE]');
  });

  it('contient une source sans URL publique', async () => {
    const v = await lireDepuisFixtures(FIXTURES);
    const sources = (v.posts as Array<{ sources: Array<{ url?: string | null }> }>).flatMap((p) => p.sources);
    expect(sources.some((s) => !s.url)).toBe(true);
  });
});

describe('lireVitrine', () => {
  it('lit les six routes de l’API quand elle répond', async () => {
    const v = await lireVitrine({ api: 'https://veille.test/', fetch: fauxFetch(), avertir: silence });
    expect(v.origine).toBe('api');
    expect(v.index.comptes.posts).toBe(2);
    expect(v.sources.length).toBe(3);
    expect(v.stats).toHaveProperty('items_par_mois');
  });

  it('se replie sur le jeu d’exemple si l’API est injoignable et que ce n’est pas interdit', async () => {
    const avertissements: string[] = [];
    const v = await lireVitrine({ api: 'https://veille.test', fetch: fauxFetch({ index: 503 }), obligatoire: false, avertir: (m) => avertissements.push(m) });
    expect(v.origine).toBe('fixtures');
    expect(avertissements[0]).toMatch(/repli/);
  });

  it('échoue en production si l’API est injoignable', async () => {
    await expect(lireVitrine({ api: 'https://veille.test', fetch: fauxFetch({ index: 503 }), obligatoire: true, avertir: silence })).rejects.toBeInstanceOf(VitrineIndisponible);
  });

  it('échoue en production sans VITRINE_API', async () => {
    await expect(lireVitrine({ api: '', obligatoire: true, avertir: silence })).rejects.toBeInstanceOf(VitrineIndisponible);
  });

  it('utilise le jeu d’exemple sans VITRINE_API hors production', async () => {
    const v = await lireVitrine({ api: '', obligatoire: false, avertir: silence });
    expect(v.origine).toBe('fixtures');
  });

  it('refuse un schéma d’une autre version, même hors production', async () => {
    const index = { version: 2, comptes: {}, modifie_le: null };
    await expect(lireVitrine({ api: 'https://veille.test', fetch: fauxFetch({ index }), obligatoire: false, avertir: silence })).rejects.toThrow(/version 2/);
  });
});
