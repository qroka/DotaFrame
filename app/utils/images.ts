const SAMPLE_SIDE = 160
/** Alpha below this counts as transparent; anti-aliasing of an opaque image never goes under it. */
const OPAQUE_ALPHA = 250

/**
 * Whether an image really has transparent pixels (a cut-out), as opposed to merely having an alpha channel:
 * many editors save fully opaque pictures as RGBA PNG. The image is decoded and scaled down, so this is cheap
 * even for large files. Returns null when the browser cannot decode the file.
 */
export async function measureTransparency(file: Blob): Promise<boolean | null> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    const scale = Math.min(1, SAMPLE_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    for (let index = 3; index < data.length; index += 4) if (data[index]! < OPAQUE_ALPHA) return true
    return false
  } catch { return null } finally { URL.revokeObjectURL(url) }
}
