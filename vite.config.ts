import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  server: {
    port: 5180, // 本项目专用端口，避免与机器上其他 vite 项目（5173）冲突
    strictPort: true,
  },
})
