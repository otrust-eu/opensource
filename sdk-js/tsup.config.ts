import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    timestamp: 'src/timestamp.ts',
    sign: 'src/sign.ts',
    proof: 'src/proof.ts',
    auth: 'src/auth.ts',
    face: 'src/face.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  treeshake: false,
  target: 'es2022',
  outDir: 'dist',
  external: [],
  noExternal: [],
  esbuildOptions(options) {
    options.platform = 'neutral'; // Works in Node, Browser, Deno, Bun
  },
});
