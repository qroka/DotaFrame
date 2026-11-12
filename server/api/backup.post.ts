import { restoreBackup } from '../utils/backup'

export default defineEventHandler(async event => restoreBackup(await readBody(event)))
