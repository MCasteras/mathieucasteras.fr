import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { itemPost } from '../../lib/flux';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts')).sort((a, b) => (b.data.publie_le ?? '').localeCompare(a.data.publie_le ?? ''));
  return rss({
    title: 'Mathieu Casteras · Posts',
    description: "Les posts publiés de ma veille sur l'IA générative en entreprise.",
    site: context.site!,
    items: posts.map((p) => itemPost(p.data)),
    customData: '<language>fr</language>',
  });
}
