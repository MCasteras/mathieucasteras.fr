/**
 * Images Open Graph (1200 × 630), générées au build sans navigateur : un SVG composé ici, rendu en PNG par resvg.
 * Deux cas : l'illustration d'un post, centrée sur la toile ; ou une carte avec le titre de la page et le nom du site.
 * Les polices viennent du système où tourne le build (DejaVu Sans dans l'image Docker) : rien n'est chargé par le navigateur.
 */
import { Resvg } from '@resvg/resvg-js';
import { FORMATS_IMAGE } from './format';

export const LARGEUR = 1200;
export const HAUTEUR = 630;
const FOND = '#ffffff';
const ENCRE = '#111111';
const ACCENT = '#0d5c63';
const MUET = '#555555';
const POLICE = "'Inter', 'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'JetBrains Mono', 'DejaVu Sans Mono', Menlo, monospace";

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Coupe un titre en lignes d'au plus `max` caractères, trois lignes au plus, la dernière tronquée avec « … ». */
export function lignes(titre: string, max = 28, maxLignes = 3): string[] {
  const mots = titre.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (essai.length <= max || !courante) courante = essai;
    else {
      out.push(courante);
      courante = mot;
    }
  }
  if (courante) out.push(courante);
  if (out.length > maxLignes) {
    const garde = out.slice(0, maxLignes);
    garde[maxLignes - 1] = garde[maxLignes - 1].slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
    return garde;
  }
  return out.map((l) => (l.length > max ? l.slice(0, max - 1) + '…' : l));
}

/** Carte avec le titre de la page (deux ou trois lignes), un sous-titre et le nom du site. */
export function svgCarte(titre: string, sousTitre = 'Mathieu Casteras · Forward Deployed Engineer', site = 'mathieucasteras.fr'): string {
  const L = lignes(titre || site);
  const taille = 56;
  const interligne = taille * 1.25;
  const debut = HAUTEUR / 2 - ((L.length - 1) * interligne) / 2 - 10;
  const texte = L.map((l, i) => `<tspan x="80" y="${Math.round(debut + i * interligne)}">${echapper(l)}</tspan>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}" viewBox="0 0 ${LARGEUR} ${HAUTEUR}">
<rect width="${LARGEUR}" height="${HAUTEUR}" fill="${FOND}"/>
<rect x="80" y="80" width="1040" height="1" fill="${ENCRE}"/>
<text x="80" y="118" font-family="${MONO}" font-size="20" fill="${ACCENT}">§</text>
<text font-family="${POLICE}" font-size="${taille}" font-weight="600" letter-spacing="-1.5" fill="${ENCRE}">${texte}</text>
<text x="80" y="548" font-family="${MONO}" font-size="22" fill="${MUET}">${echapper(sousTitre)}</text>
<text x="${LARGEUR - 80}" y="548" font-family="${MONO}" font-size="22" fill="${ACCENT}" text-anchor="end">${echapper(site)}</text>
</svg>`;
}

/** L'illustration d'un post (déjà nettoyée par l'API), centrée sur la toile Open Graph, avec ses proportions. */
export function svgDepuisPost(svgPost: string, format: string | null | undefined): string {
  const f = (format && FORMATS_IMAGE[format]) || FORMATS_IMAGE.carre;
  const echelle = Math.min(LARGEUR / f.largeur, HAUTEUR / f.hauteur);
  const w = Math.round(f.largeur * echelle);
  const h = Math.round(f.hauteur * echelle);
  const x = Math.round((LARGEUR - w) / 2);
  const y = Math.round((HAUTEUR - h) / 2);
  // Un <svg> imbriqué garde le viewBox de l'illustration et la met à l'échelle sans la retoucher.
  const interne = svgPost.replace(/<svg\b([^>]*)>/i, (_, attrs: string) => {
    const sans = attrs.replace(/\s(x|y|width|height)="[^"]*"/gi, '');
    return `<svg${sans} x="${x}" y="${y}" width="${w}" height="${h}">`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}" viewBox="0 0 ${LARGEUR} ${HAUTEUR}">
<rect width="${LARGEUR}" height="${HAUTEUR}" fill="${FOND}"/>
${interne}
</svg>`;
}

/** Rend un SVG en PNG 1200 × 630. */
export function rendrePng(svg: string): Uint8Array {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: LARGEUR },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  });
  return r.render().asPng();
}

/** Largeur et hauteur lues dans l'en-tête IHDR d'un PNG (pour les tests). */
export function dimensionsPng(png: Uint8Array): { largeur: number; hauteur: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (v.getUint32(0) !== 0x89504e47) throw new Error('pas un PNG');
  return { largeur: v.getUint32(16), hauteur: v.getUint32(20) };
}
