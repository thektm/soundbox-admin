import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5174,
  },

  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['admin.sedabox.com'],
  },

  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: true,
  },
})