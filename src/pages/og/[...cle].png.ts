/**
 * Une image Open Graph par page : `/og/defaut.png`, `/og/post-<id>.png` (l'illustration du post), `/og/fiche-<id>.png`,
 * `/og/focus-<id>.png`, `/og/note-<id>.png`, `/og/outil-<id>.png`, `/og/<section>.png`. Les pages y renvoient par `og()`.
 */
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { extrait } from '../../lib/format';
import { rendrePng, svgCarte, svgDepuisPost } from '../../lib/og';

export async function getStaticPaths() {
  const cartes: Array<{ cle: string; svg: string }> = [
    { cle: 'defaut', svg: svgCarte('Mathieu Casteras', 'Forward Deployed Engineer · IA générative en entreprise') },
    { cle: 'veille', svg: svgCarte('Veille', 'Posts, fiches hebdo et dossiers focus') },
    { cle: 'outils', svg: svgCarte('Outils') },
    { cle: 'sources', svg: svgCarte('Sources', 'Ce que ma veille lit') },
    { cle: 'notes', svg: svgCarte('Notes', "Notes de construction et retours d'expérience") },
  ];
  for (const p of await getCollection('posts')) {
    const titre = p.data.titres?.[0] || extrait(p.data.texte, 80) || p.id;
    cartes.push({ cle: `post-${p.id}`, svg: p.data.image?.svg ? svgDepuisPost(p.data.image.svg, p.data.image.format) : svgCarte(titre, 'Post') });
  }
  for (const f of await getCollection('fiches')) cartes.push({ cle: `fiche-${f.id}`, svg: svgCarte(f.data.titre || f.id, f.data.periode ? `Fiche hebdo · ${f.data.periode}` : 'Fiche hebdo') });
  for (const f of await getCollection('focus')) cartes.push({ cle: `focus-${f.id}`, svg: svgCarte(f.data.dossier?.titre || f.data.cadre?.titre || f.id, 'Dossier focus') });
  for (const n of await getCollection('notes', (n) => !n.data.brouillon)) cartes.push({ cle: `note-${n.id}`, svg: svgCarte(n.data.titre, 'Note') });
  for (const o of await getCollection('outils', (o) => !o.data.brouillon)) cartes.push({ cle: `outil-${o.id}`, svg: svgCarte(o.data.titre, 'Outil') });
  return cartes.map((c) => ({ params: { cle: c.cle }, props: { svg: c.svg } }));
}

export function GET({ props }: APIContext<{ svg: string }>) {
  const png = rendrePng(props.svg);
  return new Response(new Uint8Array(png).buffer as ArrayBuffer, { headers: { "Content-Type": "image/png" } });
}
