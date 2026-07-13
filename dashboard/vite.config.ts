import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// base '/raven/nexus/' for production builds: the SPA is embedded in the raven
// dashboard (served by the raven-hub Lambda) at coltonkirsten.com/raven/nexus/.
// Dev keeps root base so `npm run dev` still works at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/raven/nexus/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
}))
