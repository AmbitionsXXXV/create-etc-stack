import colors from 'picocolors'

// -- 类型定义 -- Type definitions
export type ColorFunc = (str: string | number) => string
export type Framework = {
	name: string
	display: string
	color: ColorFunc
	variants: FrameworkVariant[]
}
export type FrameworkVariant = {
	name: string
	display: string
	color: ColorFunc
	customCommand?: string
	monorepo?: boolean
}

const { blue, cyan, magenta, yellow } = colors

// -- 框架与模板定义 -- Frameworks and templates definition
export const FRAMEWORKS: Framework[] = [
	{
		name: 'electron',
		display: 'Electron',
		color: magenta,
		variants: [
			{
				name: 'electron-vite-shadcn-ts',
				display: 'Vite + shadcn/ui + TypeScript',
				color: blue,
				monorepo: true,
			},
		],
	},
	{
		name: 'astro',
		display: 'Astro',
		color: yellow,
		variants: [],
	},
	{
		name: 'react',
		display: 'React',
		color: cyan,
		variants: [
			// {
			// 	name: 'react-ts',
			// 	display: 'TypeScript',
			// 	color: blue,
			// },
			// {
			// 	name: 'react-swc-ts',
			// 	display: 'TypeScript + SWC',
			// 	color: blue,
			// },
			// {
			// 	name: 'react',
            
			// 	display: 'JavaScript',
			// 	color: yellow,
			// },
			// {
			// 	name: 'react-swc',
			// 	display: 'JavaScript + SWC',
			// 	color: yellow,
			// },
			{
				name: 'react-ts-biome-tailwind',
				display: 'TypeScript + Biome + Tailwind',
				color: blue,
			},
			{
				name: 'custom-react-router',
				display: 'React Router v7 ↗',
				color: cyan,
				customCommand: 'npm create react-router@latest TARGET_DIR',
			},
			{
				name: 'custom-tanstack-router',
				display: 'TanStack Router ↗',
				color: cyan,
				customCommand:
					'npm create -- tsrouter-app@latest TARGET_DIR --framework react --interactive',
			},
		],
	},
]

export const TEMPLATES = FRAMEWORKS.map((f) => f.variants.map((v) => v.name)).reduce(
	(a, b) => a.concat(b),
	[],
)
