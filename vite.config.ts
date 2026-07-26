import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The addon config.yaml is the single source of truth for the release version —
// this stamp is how a device's bundle is identified (sidebar footer).
const addonConfig = readFileSync(new URL('./ha-addon/calendhd/config.yaml', import.meta.url), 'utf8');
const version = addonConfig.match(/^version:\s*"([^"]+)"/m)?.[1];
if (!version) throw new Error('No version found in ha-addon/calendhd/config.yaml');

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit()
	],
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	resolve: {
		preserveSymlinks: true
	},
	server: {
		fs: {
			strict: false,
			allow: ['..']
		},
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/_': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			}
		}
	}
});
