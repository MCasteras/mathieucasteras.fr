/** Transformation des documents en entrées de flux RSS : titres, dates, retours à la ligne, échappement. */
import { describe, expect, it } from 'vitest';
import { itemFiche, itemNote, itemPost } from '../src/lib/flux';

describe('itemPost', () => {
  it('prend le premier titre, la date de publication et garde les paragraphes', () => {
    const it_ = itemPost({ id: 'p1', titres: ['Un titre'], texte: 'Ligne 1\nLigne 2\n\nParagraphe 2 <b>', publie_le: '2026-10-28', url_linkedin: 'https://l.in/x?a=1&b=2' });
    expect(it_.title).toBe('Un titre');
    expect(it_.link).toBe('/veille/posts/p1/');
    expect(it_.pubDate?.toISOString().slice(0, 10)).toBe('2026-10-28');
    expect(it_.content).toBe('<p>Ligne 1<br>Ligne 2</p><p>Paragraphe 2 &lt;b&gt;</p><p><a href="https://l.in/x?a=1&amp;b=2">Voir le post sur LinkedIn</a></p>');
  });

  it('se rabat sur un extrait du texte sans titre, et ne met pas de date si elle manque', () => {
    const it_ = itemPost({ id: 'p2', texte: 'Un post sans titre, assez long pour être coupé proprement au bout de quatre-vingts caractères environ.' });
    expect(it_.title!.length).toBeLessThanOrEqual(81);
    expect(it_.pubDate).toBeUndefined();
    expect(it_.content).not.toContain('LinkedIn');
  });
});

describe('itemFiche et itemNote', () => {
  it('fiche : titre ou id, période et phrase dans la description', () => {
    expect(itemFiche({ id: '2026-W43-T6', periode: 'du 20 au 24', en_une_phrase: 'Phrase.', valide_le: '2026-10-24T16:30:00Z' })).toMatchObject({
      title: '2026-W43-T6', link: '/veille/fiches/2026-W43-T6/', description: 'du 20 au 24 — Phrase.',
    });
  });

  it('note : le HTML rendu dans content', () => {
    const d = new Date('2026-11-01T00:00:00Z');
    expect(itemNote({ id: 'a', titre: 'A', date: d, html: '<p>x</p>' })).toEqual({ title: 'A', link: '/notes/a/', pubDate: d, description: undefined, content: '<p>x</p>' });
  });
});
