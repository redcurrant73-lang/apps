import { db } from '~/server/utils/firestore'

let cached: string | null = null

/** 懐石メニューのデータは常に superuser のデータ領域を使う（家族共有） */
export async function getKaisekiOwnerUid(): Promise<string> {
  if (cached) return cached
  const config = useRuntimeConfig()
  const email = (config.superuserEmail || '').toLowerCase()
  if (!email) throw createError({ statusCode: 503, message: '設定が不完全です' })
  const snap = await db.collection('users').where('email', '==', email).limit(1).get()
  if (snap.empty) throw createError({ statusCode: 503, message: 'メニューオーナーが見つかりません' })
  cached = snap.docs[0].id
  return cached
}
