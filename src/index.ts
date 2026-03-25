import fs from "node:fs"
import path from "node:path"

import * as prompts from "@clack/prompts"
import spawn from "cross-spawn"
import mri from "mri"
import colors from "picocolors"

import { FRAMEWORKS, TEMPLATES } from "./frameworks"
import { templates } from "./generated/templates"

const { cyan, magenta } = colors

const argv = mri<{
	template?: string
	help?: boolean
	overwrite?: boolean
}>(process.argv.slice(2), {
	alias: { h: "help", t: "template" },
	boolean: ["help", "overwrite"],
	string: ["template"]
})
const cwd = process.cwd()

const helpMessage = `\
Usage: create-etc-stack [OPTION]... [DIRECTORY]

Create a new project in JavaScript or TypeScript.
With no arguments, start the CLI in interactive mode.

Options:
  -t, --template NAME        use a specific template

Available templates:
${magenta("electron-vite-shadcn-ts    Electron + Vite + shadcn/ui + TypeScript")}
${cyan("react-ts-biome-tailwind    React + TypeScript + Biome + Tailwind")}`

const RENAME_FILES: Record<string, string> = {
	_gitignore: ".gitignore"
}

const defaultTargetDir = "etc-project"

async function init() {
	const argTargetDir = argv._[0] ? formatTargetDir(String(argv._[0])) : undefined
	const argTemplate = argv.template
	const argOverwrite = argv.overwrite

	if (argv.help) {
		console.log(helpMessage)
		return
	}

	const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
	const cancel = () => prompts.cancel("Operation cancelled")

	// 1. Get project name and target dir
	let targetDir = argTargetDir
	if (!targetDir) {
		const projectName = await prompts.text({
			message: "Project name:",
			defaultValue: defaultTargetDir,
			placeholder: defaultTargetDir
		})
		if (prompts.isCancel(projectName)) return cancel()
		targetDir = formatTargetDir(projectName as string)
	}

	// 2. Handle directory if exist and not empty
	if (fs.existsSync(targetDir) && !isEmpty(targetDir)) {
		const overwrite = argOverwrite
			? "yes"
			: await prompts.select({
					message: `${
						targetDir === "."
							? "Current directory"
							: `Target directory "${targetDir}"`
					} is not empty. Please choose how to proceed:`,
					options: [
						{ label: "Cancel operation", value: "no" },
						{ label: "Remove existing files and continue", value: "yes" },
						{ label: "Ignore files and continue", value: "ignore" }
					]
				})
		if (prompts.isCancel(overwrite)) return cancel()
		switch (overwrite) {
			case "yes":
				emptyDir(targetDir)
				break
			case "no":
				cancel()
				return
		}
	}

	// 3. Get package name
	let packageName = path.basename(path.resolve(targetDir))
	if (!isValidPackageName(packageName)) {
		const packageNameResult = await prompts.text({
			message: "Package name:",
			defaultValue: toValidPackageName(packageName),
			placeholder: toValidPackageName(packageName),
			validate(dir) {
				if (!dir || !isValidPackageName(dir)) {
					return "Invalid package.json name"
				}
			}
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
				: "Select a framework:",
			options: FRAMEWORKS.map((framework) => {
				const frameworkColor = framework.color
				return {
					label: frameworkColor(framework.display || framework.name),
					value: framework
				}
			})
		})
		if (prompts.isCancel(framework)) return cancel()

		const variant = await prompts.select({
			message: "Select a variant:",
			options: framework.variants.map((variant) => {
				const variantColor = variant.color
				const command = variant.customCommand
					? getFullCustomCommand(variant.customCommand, pkgInfo).replace(
							/ TARGET_DIR$/,
							""
						)
					: undefined
				return {
					label: variantColor(variant.display || variant.name),
					value: variant.name,
					hint: command
				}
			})
		})
		if (prompts.isCancel(variant)) return cancel()

		template = variant
	}

	const root = path.join(cwd, targetDir)
	fs.mkdirSync(root, { recursive: true })

	// Handle SWC variant
	let isReactSwc = false
	if (template.includes("-swc")) {
		isReactSwc = true
		template = template.replace("-swc", "")
	}

	const pkgManager = pkgInfo ? pkgInfo.name : "npm"

	// Handle custom commands (e.g. React Router, TanStack Router)
	const { customCommand } =
		FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {}

	if (customCommand) {
		const fullCustomCommand = getFullCustomCommand(customCommand, pkgInfo)
		const [command, ...args] = fullCustomCommand.split(" ")
		const replacedArgs = args.map((arg) =>
			arg.replace("TARGET_DIR", () => targetDir)
		)
		const { status } = spawn.sync(command, replacedArgs, { stdio: "inherit" })
		process.exit(status ?? 0)
	}

	// 5. Scaffold from embedded templates
	const templateData = templates[template]
	if (!templateData) {
		prompts.log.error(`Template "${template}" not found`)
		process.exit(1)
	}

	prompts.log.step(`Scaffolding project in ${root}...`)

	const variantConfig = FRAMEWORKS.flatMap((f) => f.variants).find(
		(v) => v.name === template
	)
	const isMonorepo = variantConfig?.monorepo ?? false
	const scope = isMonorepo ? `@${packageName}` : undefined

	for (const [filePath, file] of Object.entries(templateData)) {
		// Rename files like _gitignore → .gitignore
		const fileName = path.basename(filePath)
		const dirName = path.dirname(filePath)
		const renamedName = RENAME_FILES[fileName] ?? fileName
		const outputPath =
			dirName === "."
				? path.join(root, renamedName)
				: path.join(root, dirName, renamedName)

		fs.mkdirSync(path.dirname(outputPath), { recursive: true })

		if (file.encoding === "base64") {
			fs.writeFileSync(outputPath, Buffer.from(file.content, "base64"))
		} else {
			let content = file.content

			// Replace root package.json name
			if (filePath === "package.json") {
				const pkg = JSON.parse(content)
				pkg.name = packageName
				content = `${JSON.stringify(pkg, null, 2)}\n`
			}

			// Replace monorepo scope
			if (scope) {
				content = content
					.replaceAll("@repo/", `${scope}/`)
					.replaceAll('@repo"', `${scope}"`)
			}

			// Update sub-package names and productName for monorepo
			if (
				scope &&
				filePath.endsWith("package.json") &&
				filePath !== "package.json"
			) {
				const pkg = JSON.parse(content)
				const parts = filePath.split("/")
				// e.g. apps/desktop/package.json → desktop, packages/ui/package.json → ui
				if (parts.length === 3) {
					pkg.name = `${scope}/${parts[1]}`
				}
				if (pkg.productName === "my-electron-app") {
					pkg.productName = packageName
				}
				content = `${JSON.stringify(pkg, null, 2)}\n`
			}

			fs.writeFileSync(outputPath, content)
		}
	}

	if (isReactSwc) {
		setupReactSwc(root, template.endsWith("-ts"))
	}

	// Done
	let doneMessage = "Done. Now run:\n"
	const cdProjectName = path.relative(cwd, root)
	if (root !== cwd) {
		doneMessage += `\n  cd ${
			cdProjectName.includes(" ") ? `"${cdProjectName}"` : cdProjectName
		}`
	}
	switch (pkgManager) {
		case "yarn":
			doneMessage += "\n  yarn"
			doneMessage += "\n  yarn dev"
			break
		default:
			doneMessage += `\n  ${pkgManager} install`
			doneMessage += `\n  ${pkgManager} run dev`
			break
	}
	prompts.outro(doneMessage)
}

// -- Helpers --

function formatTargetDir(targetDir: string) {
	return targetDir.trim().replace(/\/+$/g, "")
}

function isValidPackageName(projectName: string) {
	return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
		projectName
	)
}

function toValidPackageName(projectName: string) {
	return projectName
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/^[._]/, "")
		.replace(/[^a-z\d\-~]+/g, "-")
}

function isEmpty(dirPath: string) {
	const files = fs.readdirSync(dirPath)
	return files.length === 0 || (files.length === 1 && files[0] === ".git")
}

function emptyDir(dir: string) {
	if (!fs.existsSync(dir)) return
	for (const file of fs.readdirSync(dir)) {
		if (file === ".git") continue
		fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
	}
}

interface PkgInfo {
	name: string
	version: string
}

function pkgFromUserAgent(userAgent: string | undefined): PkgInfo | undefined {
	if (!userAgent) return undefined
	const pkgSpec = userAgent.split(" ")[0]
	const pkgSpecArr = pkgSpec.split("/")
	return {
		name: pkgSpecArr[0],
		version: pkgSpecArr[1]
	}
}

function setupReactSwc(root: string, isTs: boolean) {
	const reactSwcPluginVersion = "3.9.0"

	editFile(path.resolve(root, "package.json"), (content) => {
		return content.replace(
			/"@vitejs\/plugin-react": ".+?"/,
			`"@vitejs/plugin-react-swc": "^${reactSwcPluginVersion}"`
		)
	})
	editFile(path.resolve(root, `vite.config.${isTs ? "ts" : "js"}`), (content) => {
		return content.replace("@vitejs/plugin-react", "@vitejs/plugin-react-swc")
	})
}

function editFile(file: string, callback: (content: string) => string) {
	const content = fs.readFileSync(file, "utf-8")
	fs.writeFileSync(file, callback(content), "utf-8")
}

function getFullCustomCommand(customCommand: string, pkgInfo?: PkgInfo) {
	const pkgManager = pkgInfo ? pkgInfo.name : "npm"
	const isYarn1 = pkgManager === "yarn" && pkgInfo?.version.startsWith("1.")

	return customCommand
		.replace(/^npm create (?:-- )?/, () => {
			if (pkgManager === "bun") return "bun x create-"
			if (pkgManager === "pnpm") return "pnpm create "
			return customCommand.startsWith("npm create -- ")
				? `${pkgManager} create -- `
				: `${pkgManager} create `
		})
		.replace("@latest", () => (isYarn1 ? "" : "@latest"))
		.replace(/^npm exec/, () => {
			if (pkgManager === "pnpm") return "pnpm dlx"
			if (pkgManager === "yarn" && !isYarn1) return "yarn dlx"
			if (pkgManager === "bun") return "bun x"
			return "npm exec"
		})
}

init().catch((e) => {
	console.error(e)
})
