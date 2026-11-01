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

  it('produit Outils, Sources, Notes et la page 404', async () => {
    expect(await page('outils')).toContain('Veille FDE');
    expect(await page('outils/veille')).toContain('En chiffres');
    expect(await page('outils/veille')).toContain('https://veille.mathieucasteras.fr');
    expect(await page('sources')).toContain('3 sources');
    expect(await page('notes')).toContain('Notes');
    expect(await readFile(path.join(dist, '404.html'), 'utf8')).toContain('Page introuvable');
  });

  it('affiche les chiffres de /api/vitrine/stats et aucun autre', async () => {
    const html = await page('outils/veille');
    expect(html).toMatch(/<strong>2<\/strong> posts publiés/);
    expect(html).toContain('octobre 2026');
    expect(html).toContain('<td>55</td><td>18</td><td>9</td>');
    expect(html).not.toContain('0,1234'); // l'usage LLM (coût) ne sort pas sur le site
  });

  it('ne pose pas de lien sur une source de lecture sans URL', async () => {
    const html = await page('sources');
    expect(html).toMatch(/<a href="https:\/\/example\.org\/blog"[^>]*>\[EXEMPLE\] Blog fictif/);
    expect(html).not.toMatch(/<a[^>]*>\[EXEMPLE\] Source sans adresse/);
  });

  it('exclut les brouillons des notes et du flux', async () => {
    expect(await page('notes')).not.toContain('Pourquoi ce site');
    const flux = await readFile(path.join(dist, 'notes.xml'), 'utf8');
    expect(flux).toContain('<rss');
    expect(flux).not.toContain('Pourquoi ce site');
  });

  it('écrit les flux RSS des posts et des fiches avec une entrée par document', async () => {
    const posts = await readFile(path.join(dist, 'veille', 'posts.xml'), 'utf8');
    expect(posts.match(/<item>/g)?.length).toBe(2);
    expect(posts).toContain('<link>https://site.test/veille/posts/p-exemple1/</link>');
    expect(posts).toContain('<language>fr</language>');
    expect(posts).toContain('Un périmètre d&apos;outils court.&lt;br&gt;');
    const fiches = await readFile(path.join(dist, 'veille', 'fiches.xml'), 'utf8');
    expect(fiches.match(/<item>/g)?.length).toBe(1);
  });

  it('écrit un sitemap qui liste les pages et pas la 404', async () => {
    expect(await readFile(path.join(dist, 'sitemap-index.xml'), 'utf8')).toContain('sitemap-0.xml');
    const carte = await readFile(path.join(dist, 'sitemap-0.xml'), 'utf8');
    for (const p of ['/', '/veille/', '/outils/veille/', '/sources/', '/notes/', '/veille/focus/f-exemple1/']) {
      expect(carte).toContain(`<loc>https://site.test${p}</loc>`);
    }
    expect(carte).not.toContain('/404');
  });

  it('refuse de construire en production sans API', async () => {
    const env = { ...process.env, VITRINE_API: '', VITRINE_OBLIGATOIRE: '1' };
    const sortie = await mkdtemp(path.join(tmpdir(), 'site-dist-'));
    await expect(run(ASTRO, ['build', '--outDir', sortie], { env })).rejects.toThrow();
    await rm(sortie, { recursive: true, force: true });
  });
});
