import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/task': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/team': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/member': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/taskAssignment': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
