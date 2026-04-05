import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit()
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
