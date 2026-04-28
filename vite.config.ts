import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { cloudflare } from "@cloudflare/vite-plugin";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
