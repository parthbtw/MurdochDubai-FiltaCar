import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const target = `http://localhost:${process.env.FILTA_API_PORT ?? '3001'}`
const proxy = Object.fromEntries(['/api', '/uploads', '/demo'].map(path => [path, { target, changeOrigin: true }]))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy },
  preview: { proxy },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
