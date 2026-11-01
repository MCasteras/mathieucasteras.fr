/** Les trois flux RSS (posts, fiches, notes) : une seule fonction par flux, testable sans Astro, utilisée par les routes *.xml.ts. */
import type { RSSFeedItem } from '@astrojs/rss';
import { extrait, paragraphes, urlHttps } from './format';

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function date(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface PostFlux { id: string; texte?: string | null; titres?: string[] | null; publie_le?: string | null; url_linkedin?: string | null }
export interface FicheFlux { id: string; titre?: string | null; periode?: string | null; valide_le?: string | null; en_une_phrase?: string | null }
export interface NoteFlux { id: string; titre: string; date: Date; resume?: string; html?: string }

/** Le post complet dans le flux, en paragraphes HTML, retours à la ligne conservés. */
export function itemPost(p: PostFlux): RSSFeedItem {
  const html = paragraphes(p.texte).map((l) => `<p>${l.map(echapper).join('<br>')}</p>`).join('');
  return {
    title: p.titres?.[0] || extrait(p.texte, 80) || p.id,
    link: `/veille/posts/${p.id}/`,
    pubDate: date(p.publie_le),
    description: extrait(p.texte, 300),
    content: html + (urlHttps(p.url_linkedin) ? `<p><a href="${echapper(urlHttps(p.url_linkedin)!)}">Voir le post sur LinkedIn</a></p>` : ''),
  };
}

export function itemFiche(f: FicheFlux): RSSFeedItem {
  return {
    title: f.titre || f.id,
    link: `/veille/fiches/${f.id}/`,
    pubDate: date(f.valide_le),
    description: [f.periode, f.en_une_phrase].filter(Boolean).join(' — ') || undefined,
  };
}

export function itemNote(n: NoteFlux): RSSFeedItem {
  return { title: n.titre, link: `/notes/${n.id}/`, pubDate: n.date, description: n.resume, content: n.html };
}
