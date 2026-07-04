import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5175,
  },
  resolve: {
    alias: {
      '@otrust/react': path.resolve(__dirname, '../../dist/index.js'),
      '@otrust/sdk': path.resolve(__dirname, '../../../sdk-js/dist/index.js'),
    },
  },
});
