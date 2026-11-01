/** Images Open Graph : découpe du titre, composition, rendu PNG aux bonnes dimensions. */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dimensionsPng, lignes, rendrePng, svgCarte, svgDepuisPost } from '../src/lib/og';

describe('lignes', () => {
  it('coupe aux mots, trois lignes au plus, et tronque la dernière', () => {
    expect(lignes('Un titre court')).toEqual(['Un titre court']);
    const L = lignes('Un titre vraiment très long qui déborde largement de ce que trois lignes de trente-quatre caractères peuvent contenir', 34);
    expect(L.length).toBe(3);
    for (const l of L) expect(l.length).toBeLessThanOrEqual(34);
    expect(L[2].endsWith('…')).toBe(true);
  });
  it('ne casse pas un mot plus long que la ligne', () => {
    expect(lignes('Supercalifragilisticexpialidocieux', 10)).toEqual(['Supercali…']);
  });
});

describe('rendu', () => {
  it('carte : un PNG 1200 × 630 avec le titre échappé', () => {
    const svg = svgCarte('Agents & <outils>');
    expect(svg).toContain('Agents &amp; &lt;outils&gt;');
    expect(dimensionsPng(rendrePng(svg))).toEqual({ largeur: 1200, hauteur: 630 });
  });

  it('post : l’illustration du jeu d’exemple centrée, sans retouche de son contenu', async () => {
    const posts = JSON.parse(await readFile('fixtures/vitrine/posts.json', 'utf8')) as Array<{ image?: { svg: string; format: string } }>;
    const img = posts[0].image!;
    const svg = svgDepuisPost(img.svg, img.format);
    expect(svg).toContain('x="285" y="0" width="630" height="630"'); // carré 1080 → 630, centré
    expect(svg).toContain('Exemple factice</text>');
    expect(dimensionsPng(rendrePng(svg))).toEqual({ largeur: 1200, hauteur: 630 });
  });

  it('post paysage : remplit la toile', () => {
    const svg = svgDepuisPost('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="627" viewBox="0 0 1200 627"><rect width="1200" height="627"/></svg>', 'paysage');
    expect(svg).toContain('x="0" y="2" width="1200" height="627"');
  });
});
