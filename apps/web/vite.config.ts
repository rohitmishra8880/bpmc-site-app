import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite ka cache bhi D: par (CLAUDE.md T9)
  cacheDir: 'D:/BPMC/.cache/vite/web',
})
