// Cloud Storage(Firebase Storage 既定バケット)用ヘルパー。
// firestore.rules / storage.rules はクライアント直アクセス禁止なので、
// このサーバー層を介してのみ読み書きする。
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'

function bucketName(): string {
  // FIREBASE_CONFIG.storageBucket と同じ命名規則。プロジェクトIDから組み立てる。
  const project =
    process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || 'apps-498001'
  return `${project}.firebasestorage.app`
}

/** appId/uid 配下に画像を保存し、imageId(=パスのキー)を返す。 */
export async function saveImage(opts: {
  appId: string
  uid: string
  base64: string
  mimeType?: string
}): Promise<{ imageId: string; size: number }> {
  const buf = Buffer.from(opts.base64, 'base64')
  // 5MB を超える圧縮済み画像は弾く(クライアント側で圧縮してから来る前提)
  if (buf.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 413, message: '画像が大きすぎます(圧縮後5MB以下)' })
  }
  const ext = (opts.mimeType || 'image/jpeg').includes('png') ? 'png' : 'jpg'
  const imageId = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
  const path = `apps/${opts.appId}/users/${opts.uid}/${imageId}`
  const file = getStorage().bucket(bucketName()).file(path)
  await file.save(buf, {
    contentType: opts.mimeType || 'image/jpeg',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=86400' },
  })
  return { imageId, size: buf.length }
}

/** 画像をダウンロードして Buffer と MIME を返す(認可は呼び出し側で済ませる前提)。 */
export async function readImage(opts: {
  appId: string
  uid: string
  imageId: string
}): Promise<{ buf: Buffer; mimeType: string }> {
  const path = `apps/${opts.appId}/users/${opts.uid}/${opts.imageId}`
  const file = getStorage().bucket(bucketName()).file(path)
  const [buf] = await file.download()
  const [meta] = await file.getMetadata()
  return { buf, mimeType: (meta.contentType as string) || 'image/jpeg' }
}

/** 保存済み画像を削除(古い会話の掃除などに使う)。 */
export async function deleteImage(opts: {
  appId: string
  uid: string
  imageId: string
}): Promise<void> {
  const path = `apps/${opts.appId}/users/${opts.uid}/${opts.imageId}`
  await getStorage().bucket(bucketName()).file(path).delete({ ignoreNotFound: true })
}
