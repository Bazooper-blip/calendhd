import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Use fallback for SPA-style client-side routing
			fallback: 'index.html',
			strict: false
		}),
		serviceWorker: {
			register: true
		},
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$db: 'src/lib/db',
			$api: 'src/lib/api',
			$sync: 'src/lib/sync',
			$ical: 'src/lib/ical',
			$utils: 'src/lib/utils',
			$types: 'src/lib/types'
		}
	}
};

export default config;
