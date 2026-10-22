import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Strict Content-Security-Policy, injected only into the production build
// (the dev server needs inline scripts for hot reload).
// connect-src: the app itself, plus (1.5.0) only the owner's Supabase project for optional cloud accounts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  // 1.5.0: + the owner's Supabase project, called only for «حساب سحابي» (cloud accounts)
  "connect-src 'self' https://wqhyubqoxqlcefwqnpwq.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'ibrahi8m-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<!--CSP-->',
      `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    );
  },
});

export default defineConfig({
  // Relative paths so the same build runs from any folder, sub-path or the desktop shell.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'brand/*'],
      manifest: {
        id: 'ibrahi8m-edu-studio',
        name: 'IBRAHI8M EDU STUDIO',
        short_name: 'EDU STUDIO',
        description: 'استوديو عربي لتصميم المحتوى التعليمي الرقمي يعمل دون إنترنت',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0E1014',
        theme_color: '#0E1014',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Every file the app needs is precached at install time — nothing is fetched later.
        globPatterns: ['**/*.{js,css,html,woff2,webp,png,svg,ico,json,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2020',
    // Only woff2 is used; skip legacy woff copies emitted by font packages.
    assetsInlineLimit: 0,
  },
});
