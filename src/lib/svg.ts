/**
 * Second filet derrière le nettoyage de l'API : un SVG de post n'est inséré dans la page que s'il ne contient ni script,
 * ni gestionnaire d'événement, ni lien ou ressource externe, ni foreignObject. Sinon il est écarté au build et signalé.
 * Ce n'est pas un nettoyeur (on ne retouche jamais le SVG), c'est un refus.
 */
const INTERDITS = /<\s*(script|foreignobject|iframe|object|embed|audio|video|a|use|image|set|animate)\b/i;
const EVENEMENT = /\son[a-z]+\s*=/i;
const JAVASCRIPT = /javascript\s*:/i;
const ENTITES_OU_IMPORT = /<!ENTITY|@import/i;
/** href/src/xlink:href : seuls `#…` (références internes) et `data:image/…` sont admis. */
const LIEN = /(?:href|src)\s*=\s*["']?\s*(?!#|data:image\/)[^"'\s>]+/i;
/** url(…) dans un style : seulement une référence interne `#…`. */
const URL_EXTERNE = /url\(\s*["']?(?!#)/i;

export function svgSur(svg: string | null | undefined): boolean {
  if (!svg) return false;
  const s = String(svg);
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg\b/i.test(s) || !/<\/svg>\s*$/i.test(s)) return false;
  return !(INTERDITS.test(s) || EVENEMENT.test(s) || JAVASCRIPT.test(s) || ENTITES_OU_IMPORT.test(s) || LIEN.test(s) || URL_EXTERNE.test(s));
}
