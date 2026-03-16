import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/models': {
        target: 'https://localhost:3000',
        secure: false,
        changeOrigin: true
      },
      '/dataset': {
        target: 'https://localhost:3000',
        secure: false,
        changeOrigin: true
      },
      '/api': {
        target: 'https://localhost:3000',
        secure: false,
        changeOrigin: true
      },
      // Covers /ws-stream, /ws-stream-N, /ws-view, /ws-view-N for any N
      '/ws-': {
        target: 'wss://localhost:3000',
        secure: false,
        ws: true
      }
    }
  }
})
