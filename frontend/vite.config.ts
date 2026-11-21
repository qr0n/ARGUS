import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Sign-in, callback, logout and session info are handled by the backend.
      '/auth': {
        target: 'https://localhost:3000',
        secure: false,
        changeOrigin: true
      },
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
      '/ws-view': {
        target: 'wss://localhost:3000',
        secure: false,
        ws: true
      },
      '/ws-stream': {
        target: 'wss://localhost:3000',
        secure: false,
        ws: true
      }
    }
  }
})
