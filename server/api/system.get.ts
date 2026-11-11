import { statSync } from 'node:fs'
import { databaseFile, useDatabase } from '../utils/database'

export default defineEventHandler(() => {
  useDatabase()
  const file = databaseFile()
  return { engine: 'SQLite', file, bytes: statSync(file).size }
})
