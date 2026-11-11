import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

export default function globalSetup() {
  rmSync(resolve('test-results/dotaframe-e2e.sqlite'), { force: true })
  rmSync(resolve('test-results/dotaframe-e2e.sqlite-shm'), { force: true })
  rmSync(resolve('test-results/dotaframe-e2e.sqlite-wal'), { force: true })
}
