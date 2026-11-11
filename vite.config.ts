import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' để chạy được cả ở localhost lẫn GitHub Pages (https://<user>.github.io/<repo>/)
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { chunkSizeWarningLimit: 1500 },
});
