// プレースホルダーのアプリアイコンを生成する。
// ブランド色の背景 + 中央に白い円。後で本物の画像に差し替えてOK。
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')
mkdirSync(publicDir, { recursive: true })

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makePng(size, bg, fg) {
  const w = size
  const h = size
  const cx = w / 2
  const cy = h / 2
  const r = size * 0.26
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
      const [rr, gg, bb] = inCircle ? fg : bg
      const o = rowStart + 1 + x * 4
      raw[o] = rr
      raw[o + 1] = gg
      raw[o + 2] = bb
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const brand = [14, 165, 233] // #0ea5e9
const white = [255, 255, 255]

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon.png', 32],
]

for (const [name, size] of targets) {
  writeFileSync(resolve(publicDir, name), makePng(size, brand, white))
  console.log('wrote', name, size)
}
