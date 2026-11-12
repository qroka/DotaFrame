import { describe, expect, it } from 'vitest'
import { mediaResponseHeaders, sniffImageType } from '../../server/utils/media'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('sniffImageType', () => {
  it('detects raster formats by signature', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImageType(text('GIF89a'))).toBe('image/gif')
    expect(sniffImageType(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
  })
  it('detects SVG with prolog, comments, doctype and BOM', () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml')
    expect(sniffImageType(text('﻿  <?xml version="1.0"?>\n<!-- c -->\n<!DOCTYPE svg PUBLIC "x" "y">\n<SVG width="1"/>'))).toBe('image/svg+xml')
  })
  it('rejects HTML, scripts, text and empty input even if they look like images by name', () => {
    expect(sniffImageType(text('<html><svg></svg></html>'))).toBeNull()
    expect(sniffImageType(text('<script>alert(1)</script>'))).toBeNull()
    expect(sniffImageType(text('<svgfoo/>'))).toBeNull()
    expect(sniffImageType(text('hello'))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
  it('does not accept RIFF files that are not WebP', () => {
    expect(sniffImageType(text('RIFF\0\0\0\0WAVEfmt '))).toBeNull()
  })
})

describe('mediaResponseHeaders', () => {
  it('serves supported images inline with nosniff and a locked-down CSP', () => {
    const headers = mediaResponseHeaders('image/svg+xml')
    expect(headers['Content-Type']).toBe('image/svg+xml')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'")
    expect(headers['Content-Security-Policy']).toContain('sandbox')
    expect(headers['Content-Disposition']).toBeUndefined()
  })
  it('downgrades unknown stored types (e.g. text/html from a crafted backup) to a download', () => {
    for (const stored of ['text/html', 'application/xhtml+xml', 'image/svg+xml; charset=x', '']) {
      const headers = mediaResponseHeaders(stored)
      expect(headers['Content-Type']).toBe('application/octet-stream')
      expect(headers['Content-Disposition']).toBe('attachment')
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
    }
  })
})
