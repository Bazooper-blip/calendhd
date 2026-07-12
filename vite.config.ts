import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit()
	],
	define: {
		// Keep package.json "version" in sync with ha-addon/calendhd/config.yaml
		// on each release — this stamp is how a device's bundle is identified.
		__APP_VERSION__: JSON.stringify(pkg.version)
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
