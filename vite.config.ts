import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [tailwindcss()],
  server: { headers },
  preview: { headers },
});
