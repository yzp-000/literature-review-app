import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      // latex.js 内部动态 require 会扫描到 .keep 占位文件
      // 告诉 esbuild 将 .keep 文件当作空 JS 处理
      loader: {
        '.keep': 'js',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
