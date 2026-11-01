import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { itemFiche } from '../../lib/flux';

export async function GET(context: APIContext) {
  const fiches = (await getCollection('fiches')).sort((a, b) => (b.data.valide_le ?? '').localeCompare(a.data.valide_le ?? ''));
  return rss({
    title: 'Mathieu Casteras · Fiches hebdo',
    description: "Une fiche par semaine sur l'IA générative en entreprise : jalons, prêt pour la production, à tester.",
    site: context.site!,
    items: fiches.map((f) => itemFiche(f.data)),
    customData: '<language>fr</language>',
  });
}
