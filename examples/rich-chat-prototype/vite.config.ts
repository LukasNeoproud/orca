import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('examples/rich-chat-prototype'),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve('src/renderer/src') } },
  server: { host: '127.0.0.1', port: 4317, strictPort: true },
  build: { outDir: resolve('out/rich-chat-prototype'), emptyOutDir: true }
})
