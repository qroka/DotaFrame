import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { HEROES } from '../src/data/heroes.js'

const outputDir = resolve('public/images/heroes')
const baseUrl = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes'
const concurrency = 8

await mkdir(outputDir, { recursive: true })

const queue = [...HEROES]
const failures = []
let downloaded = 0

async function worker() {
  while (queue.length) {
    const hero = queue.shift()
    const url = `${baseUrl}/${hero.slug}.png`

    try {
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)

      const bytes = new Uint8Array(await response.arrayBuffer())
      const isPng = bytes.length >= 8
        && bytes[0] === 0x89
        && bytes[1] === 0x50
        && bytes[2] === 0x4e
        && bytes[3] === 0x47
      if (!isPng)
        throw new Error('response is not a PNG file')

      await writeFile(resolve(outputDir, `${hero.slug}.png`), bytes)
      downloaded += 1
      console.log(`[${downloaded}/${HEROES.length}] ${hero.slug}.png`)
    }
    catch (error) {
      failures.push(`${hero.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()))

if (failures.length) {
  console.error(`Failed to download ${failures.length} portrait(s):`)
  for (const failure of failures)
    console.error(`- ${failure}`)
  process.exitCode = 1
}
else {
  console.log(`Downloaded ${downloaded} hero portraits to ${outputDir}`)
}
