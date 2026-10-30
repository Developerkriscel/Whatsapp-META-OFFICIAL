import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import prerender from '@prerenderer/rollup-plugin';
import PuppeteerRenderer from '@prerenderer/renderer-puppeteer';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      plugins: [
        prerender({
          routes: ['/pricing', '/terms', '/privacy', '/refund-policy', '/contact'],
          renderer: new PuppeteerRenderer({
            renderAfterTime: 3000,
            headless: true,
          }),
          postProcess(renderedRoute) {
            renderedRoute.html = renderedRoute.html.replace(
              /<script[^>]*type="module"[^>]*><\/script>/g,
              '',
            );
            return renderedRoute;
          },
        }),
      ],
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
