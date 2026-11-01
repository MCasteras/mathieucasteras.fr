// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `SITE_URL` sert aux URL absolues (canonical, Open Graph, flux, sitemap). Défaut : le domaine racine.
export default defineConfig({
  site: process.env.SITE_URL || 'https://mathieucasteras.fr',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') })],
});
