import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: 'src',
			strategies: 'injectManifest',
			filename: 'service-worker.ts',
			registerType: 'autoUpdate',
			manifest: false, // Use existing static/manifest.json
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB (lucide-svelte icon library chunk)
			},
			devOptions: {
				enabled: true,
				type: 'module'
			}
		})
	],
	define: {
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
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
