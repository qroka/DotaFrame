import { findOrphanMedia } from '../../utils/media-gc'

/** Dry run: lists images that nothing refers to. Deletes nothing. */
export default defineEventHandler(() => findOrphanMedia())
