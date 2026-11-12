import { restoreBackupStream } from '../utils/backup'

/** Reads the request body as a stream (no readBody): large backups are validated line by line and staged on disk. */
export default defineEventHandler(event => restoreBackupStream(event.node.req))
