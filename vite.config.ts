import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANTE: Mude 'print-quest-os' para o nome do seu repositório no GitHub
  base: '/3dprintquest/', 
})
