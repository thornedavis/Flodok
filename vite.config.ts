import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cloudflare } from "@cloudflare/vite-plugin";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version: string }

// Walk up from the project root looking for a directory that contains a
// `.env` file. This keeps `npm run dev` working from both the main checkout
// and from any git worktree under `.claude/worktrees/<name>/` — worktrees
// don't copy gitignored files, so `.env` only lives in the main checkout
// and Vite would otherwise see nothing when run from inside one.
function findEnvDir(start: string): string {
  let dir = start
  while (true) {
    if (existsSync(resolve(dir, '.env'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  envDir: findEnvDir(projectRoot),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
