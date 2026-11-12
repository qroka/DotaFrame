// Starts the production build (`npm run build` first). Binds to loopback unless a host is set explicitly,
// because the API has no authentication and /api/backup exposes the whole database.
process.env.NITRO_HOST ||= process.env.HOST || '127.0.0.1'
await import('../.output/server/index.mjs')
