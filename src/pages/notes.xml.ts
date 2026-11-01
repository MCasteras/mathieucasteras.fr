import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { itemNote } from '../lib/flux';

export async function GET(context: APIContext) {
  const notes = (await getCollection('notes', (n) => !n.data.brouillon)).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return rss({
    title: 'Mathieu Casteras · Notes',
    description: "Notes de construction et retours d'expérience.",
    site: context.site!,
    items: notes.map((n) => itemNote({ id: n.id, titre: n.data.titre, date: n.data.date, resume: n.data.resume, html: n.rendered?.html })),
    customData: '<language>fr</language>',
  });
}
