/**
 * One-shot: download the model bundle into MODEL_DIR if it is missing, then exit.
 * This is the only part of the service that touches the internet, and it sends no household
 * data: it only downloads published model files.
 */
import { access } from 'node:fs/promises'
import path from 'node:path'
import { BUNDLE_FILES } from './laya.ts'

export async function hasBundle(dir: string): Promise<boolean> {
  try {
    await Promise.all(BUNDLE_FILES.map((f) => access(path.join(dir, f))))
    return true
  } catch {
    return false
  }
}

async function main() {
  const dir = process.env.MODEL_DIR ?? '/models/laya'
  if (await hasBundle(dir)) {
    console.log(JSON.stringify({ level: 'info', msg: 'model already present', dir }))
    return
  }
  const { ensureBundle } = await import('@receptron/laya')
  const cacheDir = path.join(dir, '.cache')
  let last = 0
  const got = await ensureBundle({
    cacheDir,
    ...(process.env.LAYA_VARIANT ? { subfolder: process.env.LAYA_VARIANT } : {}),
    ...(process.env.LAYA_REVISION ? { revision: process.env.LAYA_REVISION } : {}),
    onProgress: ({ file, received, total }) => {
      if (Date.now() - last < 5000) return
      last = Date.now()
      console.log(JSON.stringify({ level: 'info', msg: 'downloading', file, received, total }))
    },
  })
  // Move the files to the fixed folder the service loads from.
  const { rename, mkdir } = await import('node:fs/promises')
  for (const f of BUNDLE_FILES) {
    await mkdir(path.dirname(path.join(dir, f)), { recursive: true })
    await rename(path.join(got, f), path.join(dir, f))
  }
  console.log(JSON.stringify({ level: 'info', msg: 'model ready', dir }))
}

if (import.meta.main) await main()
