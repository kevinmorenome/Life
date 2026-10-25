import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base + hash routing lets the build run from any static host
// (GitHub Pages subpath, Netlify, a local file server) without config.
export default defineConfig({
  base: './',
  plugins: [react()],
});
