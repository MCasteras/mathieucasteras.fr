/**
 * Collections du site. Les notes sont des fichiers Markdown ; posts, fiches, focus, sources et `vitrine`
 * (index + stats) viennent de la vitrine publique de Veille FDE (`src/data/vitrine.ts`), lue une fois par build.
 * Les schémas reprennent le contrat `veille-fde/docs/14 § 2` ; tout champ peut manquer : une case vide vaut mieux
 * qu'une valeur inventée.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import { vitrineDuBuild, type Vitrine } from './data/vitrine';
import { slug } from './lib/format';

const texte = z.string().nullish();
const refs = z.array(z.union([z.number(), z.string()])).nullish();
const modele = z.object({ applique: texte }).nullish();

const Source = z.object({ titre: texte, source: texte, url: z.string().nullish() });

const Post = z.looseObject({
  id: z.string(),
  texte,
  titres: z.array(z.string()).nullish(),
  angle: texte,
  longueur: texte,
  cree_le: texte,
  publie_le: texte,
  url_linkedin: z.string().nullish(),
  image: z.object({ svg: z.string(), format: texte, style: texte }).nullish(),
  modele,
  vitrine_le: texte,
  sources: z.array(Source).nullish(),
});

const SourceNumerotee = z.looseObject({ n: z.union([z.number(), z.string()]).nullish(), label: texte, titre: texte, url: z.string().nullish(), source: texte, role: texte });

const Fiche = z.looseObject({
  id: z.string(),
  titre: texte,
  themes: z.array(z.string()).nullish(),
  periode: texte,
  semaine: z.number().nullish(),
  valide_le: texte,
  en_une_phrase: texte,
  jalons: z.array(z.looseObject({ date: texte, texte, refs })).nullish(),
  pret_prod: z.array(z.string()).nullish(),
  experimental: z.array(z.string()).nullish(),
  a_tester: z.array(z.looseObject({ texte, refs })).nullish(),
  questions: z.array(z.looseObject({ texte })).nullish(),
  sources: z.array(SourceNumerotee).nullish(),
  modele,
  vitrine_le: texte,
});

const Dossier = z.looseObject({
  titre: texte,
  verdict: texte,
  en_bref: z.array(z.string()).nullish(),
  fonctionnement: z.looseObject({ etapes: z.array(z.looseObject({ titre: texte, texte, nouveau: z.boolean().nullish() })).nullish(), texte }).nullish(),
  benchmarks: z.array(z.looseObject({ nom: texte, annonce: texte, independant: texte, par: texte, fiabilite: texte, refs })).nullish(),
  alternatives: z.array(z.looseObject({ nom: texte, licence: texte, maturite: texte, pour: texte, contre: texte, refs })).nullish(),
  terrain: z.array(z.looseObject({ texte, refs })).nullish(),
  limites: z.array(z.looseObject({ texte, refs })).nullish(),
  questions_ouvertes: z.array(z.string()).nullish(),
  sources: z.array(SourceNumerotee).nullish(),
  stats: z.looseObject({ lues: z.number().nullish(), retenues: z.number().nullish() }).nullish(),
});

const Focus = z.looseObject({
  id: z.string(),
  cadre: z.looseObject({
    titre: texte,
    perimetre: z.looseObject({ inclus: z.array(z.string()).nullish(), exclus: z.array(z.string()).nullish() }).nullish(),
    mots_cles: z.array(z.string()).nullish(),
    themes: z.array(z.string()).nullish(),
  }).nullish(),
  dossier: Dossier.nullish(),
  pret_le: texte,
  maj_le: texte,
  modele,
  vitrine_le: texte,
});

const SourceLue = z.looseObject({ nom: texte, url: z.string().nullish(), type: texte, themes: z.array(z.string()).nullish() });

/** Un loader par collection de la vitrine : il range chaque document sous son `id`. */
function chargeurVitrine(cle: 'posts' | 'fiches' | 'focus'): Loader {
  return {
    name: `vitrine-${cle}`,
    async load({ store, parseData, logger }) {
      const v = await vitrineDuBuild();
      store.clear();
      for (const brut of v[cle] as Array<{ id?: unknown }>) {
        if (typeof brut.id !== 'string' || !brut.id) continue;
        const data = await parseData({ id: brut.id, data: brut as Record<string, unknown> });
        store.set({ id: brut.id, data });
      }
      logger.info(`${cle} : ${store.keys().length} document(s) depuis ${v.origine}`);
    },
  };
}

const chargeurSources: Loader = {
  name: 'vitrine-sources',
  async load({ store, parseData }) {
    const v = await vitrineDuBuild();
    store.clear();
    for (const brut of v.sources as Array<{ nom?: string }>) {
      let id = slug(brut.nom);
      for (let n = 2; store.has(id); n++) id = `${slug(brut.nom)}-${n}`;
      store.set({ id, data: await parseData({ id, data: brut as Record<string, unknown> }) });
    }
  },
};

/** Deux entrées : `index` (compteurs, `modifie_le`, origine) et `stats` (agrégats). */
const chargeurEtat: Loader = {
  name: 'vitrine-etat',
  async load({ store, parseData }) {
    const v = await vitrineDuBuild();
    store.clear();
    const index: Vitrine['index'] & { origine: Vitrine['origine'] } = { ...v.index, origine: v.origine };
    store.set({ id: 'index', data: await parseData({ id: 'index', data: index }) });
    store.set({ id: 'stats', data: await parseData({ id: 'stats', data: v.stats }) });
  },
};

export const collections = {
  notes: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
    schema: z.object({
      titre: z.string(),
      date: z.coerce.date(),
      resume: z.string().optional(),
      brouillon: z.boolean().default(false),
    }),
  }),
  posts: defineCollection({ loader: chargeurVitrine('posts'), schema: Post }),
  fiches: defineCollection({ loader: chargeurVitrine('fiches'), schema: Fiche }),
  focus: defineCollection({ loader: chargeurVitrine('focus'), schema: Focus }),
  sources: defineCollection({ loader: chargeurSources, schema: SourceLue }),
  vitrine: defineCollection({ loader: chargeurEtat, schema: z.looseObject({}) }),
};
