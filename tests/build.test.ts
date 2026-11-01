/** Construction complète sur le jeu d'exemple : les pages existent, les sources sans URL n'ont pas de lien, le SVG est intact. */
import { beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ASTRO = path.resolve('node_modules/.bin/astro');
let dist: string;

async function page(chemin: string): Promise<string> {
  return readFile(path.join(dist, chemin, 'index.html'), 'utf8');
}

beforeAll(async () => {
  dist = await mkdtemp(path.join(tmpdir(), 'site-dist-'));
  const env = { ...process.env, VITRINE_API: '', VITRINE_OBLIGATOIRE: '', SITE_URL: 'https://site.test' };
  await run(ASTRO, ['build', '--outDir', dist], { env, cwd: path.resolve('.') });
  return async () => rm(dist, { recursive: true, force: true });
});

describe('build sur le jeu d’exemple', () => {
  it('produit l’accueil, la veille et une page par document', async () => {
    expect(await page('')).toContain('Forward Deployed Engineer');
    expect(await page('veille')).toContain('Fiches hebdo');
    expect(await page('veille/posts/p-exemple1')).toContain('Voir le post sur LinkedIn');
    expect(await page('veille/posts/p-exemple2')).not.toContain('Voir le post sur LinkedIn');
    expect(await page('veille/fiches/2026-W43-T6-T11')).toContain('Agents');
    expect(await page('veille/focus/f-exemple1')).toContain('Dossier fictif');
  });

  it('signale le jeu d’exemple sur chaque page', async () => {
    expect(await page('veille')).toContain('jeu d\'exemple factice');
  });

  it('ne pose pas de lien sur une source sans URL', async () => {
    const html = await page('veille/posts/p-exemple2');
    expect(html).toContain('Article fictif sans URL publique');
    expect(html).not.toMatch(/<a[^>]*>\[EXEMPLE\] Article fictif sans URL publique/);
    const fiche = await page('veille/fiches/2026-W43-T6-T11');
    expect(fiche).toMatch(/<a href="https:\/\/example\.org\/fictif-1"[^>]*>\[EXEMPLE\] Article fictif numéro un/);
    expect(fiche).not.toMatch(/<a[^>]*>\[EXEMPLE\] Article fictif numéro deux/);
  });

  it('insère le SVG du post tel quel et garde les retours à la ligne du texte', async () => {
    const html = await page('veille/posts/p-exemple1');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"');
    expect(html).toContain('Exemple factice</text></svg>');
    expect(html).toContain('1. Un périmètre d&#39;outils court.<br');
  });

  it('relie les renvois [n] aux sources numérotées', async () => {
    const html = await page('veille/fiches/2026-W43-T6-T11');
    expect(html).toContain('href="#source-1"');
    expect(html).toContain('id="source-1"');
  });

  it('refuse de construire en production sans API', async () => {
    const env = { ...process.env, VITRINE_API: '', VITRINE_OBLIGATOIRE: '1' };
    const sortie = await mkdtemp(path.join(tmpdir(), 'site-dist-'));
    await expect(run(ASTRO, ['build', '--outDir', sortie], { env })).rejects.toThrow();
    await rm(sortie, { recursive: true, force: true });
  });
});
