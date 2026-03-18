# create-etc-stack

[![npm version](https://badge.fury.io/js/create-etc-stack.svg)](https://badge.fury.io/js/create-etc-stack)

Quickly scaffold new, opinionated project structures suitable for medium-sized applications, enforcing strong specifications and best practices from the start.

## Features

- **Rapid Setup** — Get your project running in seconds with interactive prompts
- **Opinionated Templates** — Start with well-defined structures, configs, and tooling baked in
- **Embedded Templates** — All templates are bundled into the CLI at build time — no filesystem dependency at runtime
- **Standalone Binary** — Ship as a single executable via `bun build --compile`, zero runtime dependencies
- **Monorepo Support** — Electron template scaffolds a full Turbo + pnpm monorepo with automatic `@scope` replacement

## Getting Started

```bash
# npm
npx create-etc-stack@latest my-app

# pnpm
pnpm create etc-stack@latest my-app

# bun
bun create etc-stack my-app

# yarn
yarn create etc-stack my-app

# or use the alias
npx cva@latest my-app
```

You can also specify a template directly:

```bash
npx create-etc-stack@latest my-app -t electron-vite-shadcn-ts
```

## Available Templates

### Electron

| Template | Stack |
|----------|-------|
| `electron-vite-shadcn-ts` | Electron 41 + Vite + React 19 + TanStack Router/Query + shadcn/ui (base-mira) + Tailwind CSS 4 + Turbo monorepo |

### React

| Template | Stack |
|----------|-------|
| `react-ts-biome-tailwind` | React Router v7 + TypeScript + Biome + Tailwind CSS |
| React Router ↗ | `npm create react-router@latest` (custom command) |
| TanStack Router ↗ | `npm create tsrouter-app@latest` (custom command) |

### Astro

Astro templates are planned — contributions welcome.

## Building from Source

```bash
# Install dependencies
bun install

# Build for npm (tsdown)
bun run build

# Build standalone binary (bun compile)
bun run build:compile

# Development (watch mode)
bun run dev
```

### Build Outputs

| Command | Output | Size | Use case |
|---------|--------|------|----------|
| `bun run build` | `dist/index.mjs` | ~135 KB | npm publish |
| `bun run build:compile` | `create-etc-stack` | ~62 MB | Standalone binary |

### How it Works

Templates are embedded into the CLI bundle at build time:

1. `scripts/embed-templates.ts` reads all `template-*` directories and generates `src/generated/templates.ts`
2. tsdown (or bun) bundles everything into a single file
3. At runtime, the CLI writes files from embedded data — no template directories needed on disk

This architecture enables both npm distribution and standalone binary distribution from the same codebase.

## Tech Stack

- **Bundler** — [tsdown](https://tsdown.dev) (powered by Rolldown)
- **Binary** — [Bun single-file executable](https://bun.sh/docs/bundler/executables)
- **Prompts** — [@clack/prompts](https://github.com/bombshell-dev/clack)
- **Templates** — Embedded at build time, supports text + binary files

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT
