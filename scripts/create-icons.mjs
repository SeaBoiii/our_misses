import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const dir = new URL('../public/icons/', import.meta.url)
const source = await readFile(new URL('icon.svg', dir))
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(source).resize(size, size).png().toFile(new URL(name, dir).pathname.replace(/^\/(\w:)/, '$1'))
}
// Square corners fill every mask shape; the heart already sits inside the safe circle.
const maskable = source.toString().replace('rx="112"', 'rx="0"')
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(new URL('icon-maskable-512.png', dir).pathname.replace(/^\/(\w:)/, '$1'))
console.log('Icons written to public/icons.')
