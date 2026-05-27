import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: false,
  treeshake: true,
  target: 'es2022',
  outDir: 'dist',
  external: ['react', 'react-dom', '@otrust/sdk'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
