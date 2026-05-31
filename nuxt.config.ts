// Nuxt 3 設定
// - 認証必須のミニアプリ・プラットフォーム
// - クライアントは Firebase Auth、サーバーは firebase-admin
// - シークレットは Secret Manager → 環境変数(NUXT_*)で注入される
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  // 認証はクライアント側 Firebase に強く依存するため SPA 寄りで運用する。
  // ただし Nitro サーバー(server/api)は通常どおり動く。
  ssr: true,

  modules: ['@nuxtjs/tailwindcss', '@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      title: 'apps',
      meta: [
        { charset: 'utf-8' },
        // 拡大禁止(ピンチズーム / ダブルタップズーム を無効化)
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
        },
        { name: 'theme-color', content: '#0ea5e9' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      ],
      link: [
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'icon', href: '/favicon.png', type: 'image/png' },
      ],
    },
  },

  // runtimeConfig:
  //  - ルート直下 = サーバー専用 (NUXT_XXX で上書き)
  //  - public     = クライアントにも渡る (NUXT_PUBLIC_XXX で上書き)
  runtimeConfig: {
    // Gemini は Vertex AI 経由で呼ぶ(AI Studio の prepayment-credit モデルを回避)。
    // location=global は対応モデルが広い(asia-northeast1 は gemini-2.0-flash 無し)。
    gcpProjectId: '',
    vertexLocation: 'global',
    geminiModel: 'gemini-2.5-flash',
    vapidPublic: '',
    vapidPrivate: '',
    vapidSubject: 'mailto:admin@example.com',
    // 初期ロール判定用 (メールアドレスでマッチ)
    superuserEmail: '',
    ownerEmail: '',
    public: {
      // Firebase クライアント設定 (公開 JSON 文字列)
      firebaseConfig: '',
      // Web Push 購読に使う公開鍵
      vapidPublic: '',
    },
  },

  nitro: {
    preset: 'node-server',
  },

  pwa: {
    registerType: 'autoUpdate',
    // generateSW(Workbox 自動生成)+ importScripts でカスタムの Web Push ハンドラを読み込む。
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,json,woff2}'],
      importScripts: ['/push-sw.js'],
      skipWaiting: true,
      clientsClaim: true,
      // SSR / API はキャッシュにフォールバックさせない
      navigateFallbackDenylist: [/^\/api\//],
    },
    manifest: {
      id: '/',
      scope: '/',
      name: 'apps',
      short_name: 'apps',
      description: 'ミニアプリ・プラットフォーム',
      lang: 'ja',
      dir: 'ltr',
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#0ea5e9',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    devOptions: {
      enabled: true,
      suppressWarnings: true,
    },
  },
})
