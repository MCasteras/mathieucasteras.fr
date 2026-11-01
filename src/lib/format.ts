/** Petits formats partagés par les pages : dates en français, texte des posts, étiquettes. */

const dateLongue = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/** `2026-10-28` ou `2026-10-28T07:12:00Z` → « 28 octobre 2026 ». Vide si la date manque ou n'est pas lisible. */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? '' : dateLongue.format(d);
}

/** Le texte d'un post garde ses retours à la ligne : un paragraphe par ligne vide, un saut de ligne sinon. */
export function paragraphes(texte: string | null | undefined): string[][] {
  return (texte ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.split('\n'))
    .filter((lignes) => lignes.some((l) => l.trim() !== ''));
}

/** Les cent premiers caractères d'un post, pour une liste. */
export function extrait(texte: string | null | undefined, max = 160): string {
  const t = (texte ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/** Identifiant sûr pour une URL à partir d'un nom (sources). */
export function slug(nom: string | null | undefined): string {
  return (nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sans-nom';
}

export const FORMATS_IMAGE: Record<string, { largeur: number; hauteur: number }> = {
  carre: { largeur: 1080, hauteur: 1080 },
  portrait: { largeur: 1080, hauteur: 1350 },
  paysage: { largeur: 1200, hauteur: 627 },
};

/** Une URL `https://` vers un hôte public, ou rien : jamais un `javascript:` ni un chemin relatif dans un `href`. */
export function urlHttps(v: string | null | undefined): string | undefined {
  const u = (v ?? '').trim();
  return /^https:\/\/[^\s/]+\.[^\s/]+/.test(u) ? u : undefined;
}
