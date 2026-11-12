// Starts the Nuxt dev server for Playwright with the e2e environment. A Node launcher instead of
// `VAR=1 command` in the config, because that syntax does not work in cmd.exe / PowerShell.
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const port = process.env.E2E_PORT || '5199'
const mock = process.env.E2E_MOCK_PORT || '5200'

const child = spawn(process.execPath, [resolve('node_modules/nuxt/bin/nuxt.mjs'), 'dev', '--host', '127.0.0.1', '--port', port], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NUXT_IGNORE_LOCK: '1',
    PANDASCORE_TOKEN: 'e2e-secret',
    PANDASCORE_BASE_URL: `http://127.0.0.1:${mock}`,
    OPENDOTA_BASE_URL: `http://127.0.0.1:${mock}/api`,
    DOTAFRAME_DATABASE_PATH: 'test-results/dotaframe-e2e.sqlite'
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(); process.exit(0) })
child.on('exit', code => process.exit(code ?? 0))
