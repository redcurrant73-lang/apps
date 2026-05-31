// Web Push の購読情報を保存する。ログインユーザーごとに紐づける。
import { FieldValue } from 'firebase-admin/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const sub = await readBody(event)

  const endpoint = String(sub?.endpoint ?? '')
  if (!endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw createError({ statusCode: 400, message: '購読情報が不正です' })
  }

  // endpoint から安定したドキュメントIDを作る('/'を含まない base64url)
  const subId = Buffer.from(endpoint).toString('base64url').slice(0, 256)

  await db.collection('pushSubs').doc(subId).set(
    {
      uid: decoded.uid,
      endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return { ok: true }
})
