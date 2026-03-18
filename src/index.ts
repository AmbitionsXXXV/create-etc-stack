import * as prompts from '@clack/prompts'
import spawn from 'cross-spawn'
import mri from 'mri'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import colors from 'picocolors'

import { FRAMEWORKS, TEMPLATES } from './frameworks'

const { cyan, magenta } = colors

const argv = mri<{
	template?: string
	help?: boolean
	overwrite?: boolean
}>(process.argv.slice(2), {
	alias: { h: 'help', t: 'template' },
	boolean: ['help', 'overwrite'],
	string: ['template'],
})
const cwd = process.cwd()

const helpMessage = `\
Usage: create-etc-stack [OPTION]... [DIRECTORY]

Create a new project in JavaScript or TypeScript.
With no arguments, start the CLI in interactive mode.

Options:
  -t, --template NAME        use a specific template

Available templates:
${magenta('electron-vite-shadcn-ts    Electron + Vite + shadcn/ui + TypeScript')}
${cyan('react-ts-biome-tailwind    React + TypeScript + Biome + Tailwind')}`

const renameFiles: Record<string, string | undefined> = {
	_gitignore: '.gitignore',
}

const defaultTargetDir = 'etc-project'

async function init() {
	const argTargetDir = argv._[0] ? formatTargetDir(String(argv._[0])) : undefined
	const argTemplate = argv.template
	const argOverwrite = argv.overwrite

	const help = argv.help
	if (help) {
		console.log(helpMessage)
		return
	}

	const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
	const cancel = () => prompts.cancel('Operation cancelled')

	// 1. Get project name and target dir
	let targetDir = argTargetDir
	if (!targetDir) {
		const projectName = await prompts.text({
			message: 'Project name:',
			defaultValue: defaultTargetDir,
			placeholder: defaultTargetDir,
		})
		if (prompts.isCancel(projectName)) return cancel()
		targetDir = formatTargetDir(projectName as string)
	}

	// 2. Handle directory if exist and not empty
	if (fs.existsSync(targetDir) && !isEmpty(targetDir)) {
		const overwrite = argOverwrite
			? 'yes'
			: await prompts.select({
					message: `${
						targetDir === '.'
							? 'Current directory'
							: `Target directory "${targetDir}"`
					} is not empty. Please choose how to proceed:`,
					options: [
						{
							label: 'Cancel operation',
							value: 'no',
						},
						{
							label: 'Remove existing files and continue',
							value: 'yes',
						},
						{
							label: 'Ignore files and continue',
							value: 'ignore',
						},
					],
				})
		if (prompts.isCancel(overwrite)) return cancel()
		switch (overwrite) {
			case 'yes':
				emptyDir(targetDir)
				break
			case 'no':
				cancel()
				return
		}
	}

	// 3. Get package name
	let packageName = path.basename(path.resolve(targetDir))
	if (!isValidPackageName(packageName)) {
		const packageNameResult = await prompts.text({
			message: 'Package name:',
			defaultValue: toValidPackageName(packageName),
			placeholder: toValidPackageName(packageName),
			validate(dir) {
				if (!dir || !isValidPackageName(dir)) {
					return 'Invalid package.json name'
				}
			},
		})
		if (prompts.isCancel(packageNameResult)) return cancel()
		packageName = packageNameResult
	}

	// 4. Choose a framework and variant
	let template = argTemplate
	let hasInvalidArgTemplate = false
	if (argTemplate && !TEMPLATES.includes(argTemplate)) {
		template = undefined
		hasInvalidArgTemplate = true
	}
	if (!template) {
		const framework = await prompts.select({
			message: hasInvalidArgTemplate
				? `"${argTemplate}" isn't a valid template. Please choose from below: `
				: 'Select a framework:',
			options: FRAMEWORKS.map((framework) => {
				const frameworkColor = framework.color
				return {
					label: frameworkColor(framework.display || framework.name),
					value: framework,
				}
			}),
		})
		if (prompts.isCancel(framework)) return cancel()

		const variant = await prompts.select({
			message: 'Select a variant:',
			options: framework.variants.map((variant) => {
				const variantColor = variant.color
				const command = variant.customCommand
					? getFullCustomCommand(variant.customCommand, pkgInfo).replace(
							/ TARGET_DIR$/,
							'',
						)
					: undefined
				return {
					label: variantColor(variant.display || variant.name),
					value: variant.name,
					hint: command,
				}
			}),
		})
		if (prompts.isCancel(variant)) return cancel()

		template = variant
	}

	const root = path.join(cwd, targetDir)
	fs.mkdirSync(root, { recursive: true })

	// determine template
	let isReactSwc = false
	if (template.includes('-swc')) {
		isReactSwc = true
		template = template.replace('-swc', '')
	}

	const pkgManager = pkgInfo ? pkgInfo.name : 'npm'

	const { customCommand } =
		FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {}

	if (customCommand) {
		const fullCustomCommand = getFullCustomCommand(customCommand, pkgInfo)

		const [command, ...args] = fullCustomCommand.split(' ')
		// we replace TARGET_DIR here because targetDir may include a space
		const replacedArgs = args.map((arg) =>
			arg.replace('TARGET_DIR', () => targetDir),
		)
		const { status } = spawn.sync(command, replacedArgs, {
			stdio: 'inherit',
		})
		process.exit(status ?? 0)
	}

	prompts.log.step(`Scaffolding project in ${root}...`)

	const templateDir = path.resolve(
		fileURLToPath(import.meta.url),
		'../..',
		`template-${template}`,
	)

	const write = (file: string, content?: string) => {
		const targetPath = path.join(root, renameFiles[file] ?? file)
		if (content) {
			fs.writeFileSync(targetPath, content)
		} else {
			copy(path.join(templateDir, file), targetPath)
		}
	}

	const files = fs.readdirSync(templateDir)
	for (const file of files.filter((f) => f !== 'package.json')) {
		write(file)
	}

	const pkg = JSON.parse(
		fs.readFileSync(path.join(templateDir, 'package.json'), 'utf-8'),
	)

	pkg.name = packageName

	write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

	if (isReactSwc) {
		setupReactSwc(root, template.endsWith('-ts'))
	}

	// 6. Handle monorepo scope replacement
	const variantConfig =
		FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template)
	if (variantConfig?.monorepo) {
		const scope = `@${packageName}`
		replaceMonorepoScope(root, scope)

		// Also update sub-package names
		const appsDir = path.join(root, 'apps')
		const packagesDir = path.join(root, 'packages')
		for (const dir of [appsDir, packagesDir]) {
			if (!fs.existsSync(dir)) continue
			for (const sub of fs.readdirSync(dir)) {
				const subPkg = path.join(dir, sub, 'package.json')
				if (fs.existsSync(subPkg)) {
					const content = JSON.parse(fs.readFileSync(subPkg, 'utf-8'))
					content.name = `${scope}/${sub}`
					if (content.productName === 'my-electron-app') {
						content.productName = packageName
					}
					fs.writeFileSync(subPkg, `${JSON.stringify(content, null, 2)}\n`)
				}
			}
		}
	}

	let doneMessage = ''
	const cdProjectName = path.relative(cwd, root)
	doneMessage += 'Done. Now run:\n'
	if (root !== cwd) {
		doneMessage += `\n  cd ${
			cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName
		}`
	}
	switch (pkgManager) {
		case 'yarn':
			doneMessage += '\n  yarn'
			doneMessage += '\n  yarn dev'
			break
		default:
			doneMessage += `\n  ${pkgManager} install`
			doneMessage += `\n  ${pkgManager} run dev`
			break
	}
	prompts.outro(doneMessage)
}

function replaceMonorepoScope(root: string, scope: string) {
	const textExtensions = new Set([
		'.ts',
		'.tsx',
		'.js',
		'.jsx',
		'.json',
		'.css',
		'.html',
		'.mjs',
		'.cjs',
		'.yaml',
		'.yml',
	])

	function walkAndReplace(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				walkAndReplace(fullPath)
			} else if (textExtensions.has(path.extname(entry.name))) {
				const content = fs.readFileSync(fullPath, 'utf-8')
				const replaced = content.replaceAll('@repo/', `${scope}/`).replaceAll('@repo"', `${scope}"`)
				if (replaced !== content) {
					fs.writeFileSync(fullPath, replaced, 'utf-8')
				}
			}
		}
	}

	walkAndReplace(root)
}

function formatTargetDir(targetDir: string) {
	return targetDir.trim().replace(/\/+$/g, '')
}

function copy(src: string, dest: string) {
	const stat = fs.statSync(src)
	if (stat.isDirectory()) {
		copyDir(src, dest)
	} else {
		fs.copyFileSync(src, dest)
	}
}

function isValidPackageName(projectName: string) {
	return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
		projectName,
	)
}

function toValidPackageName(projectName: string) {
	return projectName
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/^[._]/, '')
		.replace(/[^a-z\d\-~]+/g, '-')
}

function copyDir(srcDir: string, destDir: string) {
	fs.mkdirSync(destDir, { recursive: true })
	for (const file of fs.readdirSync(srcDir)) {
		const srcFile = path.resolve(srcDir, file)
		const destFile = path.resolve(destDir, file)
		copy(srcFile, destFile)
	}
}

function isEmpty(path: string) {
	const files = fs.readdirSync(path)
	return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function emptyDir(dir: string) {
	if (!fs.existsSync(dir)) {
		return
	}
	for (const file of fs.readdirSync(dir)) {
		if (file === '.git') {
			continue
		}
		fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
	}
}

interface PkgInfo {
	name: string
	version: string
}

function pkgFromUserAgent(userAgent: string | undefined): PkgInfo | undefined {
	if (!userAgent) return undefined
	const pkgSpec = userAgent.split(' ')[0]
	const pkgSpecArr = pkgSpec.split('/')
	return {
		name: pkgSpecArr[0],
		version: pkgSpecArr[1],
	}
}

function setupReactSwc(root: string, isTs: boolean) {
	// renovate: datasource=npm depName=@vitejs/plugin-react-swc
	const reactSwcPluginVersion = '3.9.0'

	editFile(path.resolve(root, 'package.json'), (content) => {
		return content.replace(
			/"@vitejs\/plugin-react": ".+?"/,
			`"@vitejs/plugin-react-swc": "^${reactSwcPluginVersion}"`,
		)
	})
	editFile(path.resolve(root, `vite.config.${isTs ? 'ts' : 'js'}`), (content) => {
		return content.replace('@vitejs/plugin-react', '@vitejs/plugin-react-swc')
	})
}

function editFile(file: string, callback: (content: string) => string) {
	const content = fs.readFileSync(file, 'utf-8')
	fs.writeFileSync(file, callback(content), 'utf-8')
}

function getFullCustomCommand(customCommand: string, pkgInfo?: PkgInfo) {
	const pkgManager = pkgInfo ? pkgInfo.name : 'npm'
	const isYarn1 = pkgManager === 'yarn' && pkgInfo?.version.startsWith('1.')

	return (
		customCommand
			.replace(/^npm create (?:-- )?/, () => {
				// `bun create` uses it's own set of templates,
				// the closest alternative is using `bun x` directly on the package
				if (pkgManager === 'bun') {
					return 'bun x create-'
				}
				// pnpm doesn't support the -- syntax
				if (pkgManager === 'pnpm') {
					return 'pnpm create '
				}
				// For other package managers, preserve the original format
				return customCommand.startsWith('npm create -- ')
					? `${pkgManager} create -- `
					: `${pkgManager} create `
			})
			// Only Yarn 1.x doesn't support `@version` in the `create` command
			.replace('@latest', () => (isYarn1 ? '' : '@latest'))
			.replace(/^npm exec/, () => {
				// Prefer `pnpm dlx`, `yarn dlx`, or `bun x`
				if (pkgManager === 'pnpm') {
					return 'pnpm dlx'
				}
				if (pkgManager === 'yarn' && !isYarn1) {
					return 'yarn dlx'
				}
				if (pkgManager === 'bun') {
					return 'bun x'
				}
				// Use `npm exec` in all other cases,
				// including Yarn 1.x and other custom npm clients.
				return 'npm exec'
			})
	)
}

init().catch((e) => {
	console.error(e)
})
