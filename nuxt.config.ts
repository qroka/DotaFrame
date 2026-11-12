export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  runtimeConfig: {
    pandascoreToken: process.env.PANDASCORE_TOKEN,
    opendotaApiKey: process.env.OPENDOTA_API_KEY
  },
  css: ['~/assets/css/main.css', '~~/src/styles/poster.css'],
  ssr: false,
  // Local tool without authentication: listen on loopback only (override with --host / NUXT_HOST if you really need LAN access).
  devServer: { host: '127.0.0.1' },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      titleTemplate: '%s · DotaFrame',
      meta: [
        { name: 'description', content: 'Локальный редактор графики для Dota 2' },
        { name: 'theme-color', content: '#090b10' }
      ],
      link: [{ rel: 'icon', href: '/favicon.svg' }]
    }
  },
  ui: { colorMode: true, fonts: false },
  icon: {
    clientBundle: { scan: true },
    // Local icons, e.g. i-df-no-logo (team without a logo); files live in app/assets/icons.
    customCollections: [{ prefix: 'df', dir: './app/assets/icons' }]
  },
  typescript: { typeCheck: false },
  vite: { optimizeDeps: { include: ['html-to-image'] } }
})
