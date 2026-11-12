/**
 * Image validation and safe serving helpers for the `media` table.
 * The declared Content-Type of an upload is never trusted: the type comes from the file signature.
 */

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] as const
export type ImageType = typeof IMAGE_TYPES[number]
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value)
const SVG_START = /^(?:<\?xml[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!doctype[\s\S]*?>\s*)*<svg[\s>]/i

/** Detect the image type from the first bytes; returns null for anything that is not a supported image. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  const head = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^﻿/, '').trimStart()
  return SVG_START.test(head) ? 'image/svg+xml' : null
}

const PNG_SIGNATURE_LENGTH = 8
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))

/**
 * Whether an image can contain transparent pixels, judged from the file header only:
 * true / false when the format makes it certain, null when it cannot be known (GIF, SVG, unreadable files).
 */
export function detectTransparency(bytes: Uint8Array, type: ImageType): boolean | null {
  if (type === 'image/jpeg') return false
  if (type === 'image/png') {
    // IHDR colour type: 4 = grey + alpha, 6 = RGBA; other types are opaque unless a tRNS chunk says otherwise.
    const colorType = bytes[PNG_SIGNATURE_LENGTH + 8 + 9]
    if (colorType === 4 || colorType === 6) return true
    let offset = PNG_SIGNATURE_LENGTH
    while (offset + 8 <= bytes.length) {
      const length = ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
      const name = ascii(bytes, offset + 4, 4)
      if (name === 'tRNS') return true
      if (name === 'IDAT' || name === 'IEND') return false
      offset += 12 + length
    }
    return colorType === undefined ? null : false
  }
  if (type === 'image/webp') {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8X') return ((bytes[20] ?? 0) & 0x10) !== 0
    if (chunk === 'VP8L') return ((bytes[24] ?? 0) & 0x10) !== 0
    if (chunk === 'VP8 ') return false
  }
  return null
}

export const isImageType = (value: string): value is ImageType => (IMAGE_TYPES as readonly string[]).includes(value)

/**
 * Response headers for serving stored bytes. An unknown stored type (for example one restored from a
 * crafted backup) is downgraded to a download, and scripts can never run from a directly opened SVG.
 */
export function mediaResponseHeaders(storedType: string): Record<string, string> {
  const safe = isImageType(storedType)
  return {
    'Content-Type': safe ? storedType : 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    ...(safe ? {} : { 'Content-Disposition': 'attachment' })
  }
}
