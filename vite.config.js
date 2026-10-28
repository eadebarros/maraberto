import { defineConfig } from 'vite';

// Two pages: the landing (index.html) and the terms page (termos.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        termos: 'termos.html',
      },
    },
  },
});
