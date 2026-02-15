import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'webview',
  base: './',
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'style.css'
          return 'assets/[name]-[hash][extname]'
        },
        // Bundle everything into a single file to avoid
        // dynamic import failures in VS Code webview CSP
        inlineDynamicImports: true,
      },
    },
  },
})
