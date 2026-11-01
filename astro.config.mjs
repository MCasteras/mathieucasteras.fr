// @ts-check
import { defineConfig } from 'astro/config';

// `SITE_URL` sert aux URL absolues (canonical, Open Graph, flux). Défaut : le domaine racine.
export default defineConfig({
  site: process.env.SITE_URL || 'https://mathieucasteras.fr',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
