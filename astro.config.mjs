import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: update to the real production domain before deploying.
export const SITE_URL = 'https://patioriquelme.cl';

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
});
