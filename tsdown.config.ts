import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/index.ts'],
	format: 'esm',
	target: 'node20',
	platform: 'node',
	minify: true,
	clean: true,
	banner: { js: '#!/usr/bin/env node' },
	deps: {
		alwaysBundle: [
			'@clack/prompts',
			'@clack/core',
			'cross-spawn',
			'mri',
			'picocolors',
			'sisteransi',
		],
	},
})
