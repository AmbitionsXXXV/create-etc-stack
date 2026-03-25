import { defineConfig } from "vite-plus"

export default defineConfig({
	fmt: {
		arrowParens: "always",
		bracketSameLine: false,
		bracketSpacing: true,
		endOfLine: "lf",
		experimentalSortImports: {
			ignoreCase: true,
			newlinesBetween: true,
			order: "asc"
		},
		experimentalSortPackageJson: true,
		ignorePatterns: [
			"**/dist/**",
			"**/node_modules/**",
			"src/generated/**",
			"template-*/**"
		],
		jsxSingleQuote: false,
		printWidth: 85,
		quoteProps: "as-needed",
		semi: false,
		singleQuote: false,
		tabWidth: 2,
		trailingComma: "none",
		useTabs: true
	},
	lint: {
		ignorePatterns: [
			"**/dist/**",
			"**/node_modules/**",
			"src/generated/**",
			"template-*/**"
		]
	},
	pack: {
		banner: { js: "#!/usr/bin/env node" },
		clean: true,
		deps: {
			alwaysBundle: [
				"@clack/prompts",
				"@clack/core",
				"cross-spawn",
				"mri",
				"picocolors",
				"sisteransi"
			]
		},
		entry: ["src/index.ts"],
		format: "esm",
		minify: true,
		platform: "node",
		target: "node20"
	}
})
