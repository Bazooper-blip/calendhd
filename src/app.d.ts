// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	// Injected at build time by vite.config.ts from package.json "version"
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
