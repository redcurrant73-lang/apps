// 権限チェックの中枢
// firestore.rules は全 deny。アクセス制御はすべてここ(サーバー)で行う。
import type { H3Event } from 'h3'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firestore'

export type Role = 'owner' | 'superuser' | 'user'
export type DataScope = 'per-user' | 'per-org' | 'global'

/**
 * ログイン必須。ID Token を検証して decoded token (uid, email 等) を返す。
 *
 * トークンの取得元は 2 経路:
 *   1) Authorization: Bearer <token>   — $fetch から呼ぶ通常API
 *   2) Cookie: __session=<token>       — <img src> / <a href> 等、ヘッダーを
 *                                        付けられないブラウザのリクエスト
 *
 * Cookie は firebase.client.ts が onAuthStateChanged で書き込む。
 */
export async function requireAuth(event: H3Event) {
  const header = getRequestHeader(event, 'authorization') || ''
  let token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    token = getCookie(event, '__session') || ''
  }
  if (!token) {
    throw createError({ statusCode: 401, message: 'ログインが必要です' })
  }
  try {
    return await getAuth().verifyIdToken(token)
  } catch {
    throw createError({ statusCode: 401, message: 'セッションが無効です。再ログインしてください' })
  }
}

/** users/{uid}.role を取得 */
export async function getUserRole(uid: string): Promise<Role | null> {
  const snap = await db.collection('users').doc(uid).get()
  return (snap.data()?.role as Role) ?? null
}

/**
 * アプリ世界の管理者(superuser)のみ通す。
 * owner は「システム管理ラベル」であってアプリ世界では普通のユーザー扱いなので通さない。
 * (owner が緊急で何か触る必要があるときは Firestore / GCP コンソール直で対応する)
 */
export async function requireSuperuser(event: H3Event) {
  const decoded = await requireAuth(event)
  const role = await getUserRole(decoded.uid)
  if (role !== 'superuser') {
    throw createError({ statusCode: 403, message: '権限がありません' })
  }
  return decoded
}

// owner が招待なしでも見られるアプリ(招待制のままだが、世帯内の本人は最初から見える)。
// プライバシー設計上 owner に「全アプリ自動表示」はしない。ここに挙げたものだけが例外。
const OWNER_VISIBLE_APPS = ['exam-prep']

/**
 * 指定アプリへのアクセス権があるか。
 * superuser は全アプリ可。owner は原則 appAccess が必要だが、OWNER_VISIBLE_APPS は例外的に可。
 * それ以外のユーザーは appAccess(招待)が必要。
 */
export async function hasAppAccess(uid: string, appId: string, role?: Role | null) {
  const r = role ?? (await getUserRole(uid))
  if (r === 'superuser') return true
  if (r === 'owner' && OWNER_VISIBLE_APPS.includes(appId)) return true
  const snap = await db.collection('appAccess').doc(`${uid}_${appId}`).get()
  return snap.exists
}

/** 指定アプリへのアクセス権を必須にする */
export async function requireAppAccess(event: H3Event, appId: string) {
  const decoded = await requireAuth(event)
  const ok = await hasAppAccess(decoded.uid, appId)
  if (!ok) {
    throw createError({ statusCode: 403, message: 'このアプリへのアクセス権がありません' })
  }
  return decoded
}

/**
 * ミニアプリのデータ保存パスを組み立てる。
 * dataScope によって per-user / per-org / global を切り替える。
 */
export function appDataPath(
  appId: string,
  dataScope: DataScope,
  opts: { uid?: string; orgId?: string } = {},
): string {
  switch (dataScope) {
    case 'per-user':
      if (!opts.uid) throw createError({ statusCode: 500, message: 'per-user には uid が必要です' })
      return `apps/${appId}/users/${opts.uid}`
    case 'per-org':
      if (!opts.orgId) throw createError({ statusCode: 500, message: 'per-org には orgId が必要です' })
      return `apps/${appId}/orgs/${opts.orgId}`
    case 'global':
      return `apps/${appId}/data`
    default:
      throw createError({ statusCode: 500, message: `不明な dataScope: ${dataScope}` })
  }
}

/**
 * ログイン時に users/{uid} を用意する。
 * 初回はデフォルト role=user。ただしメールアドレスが owner/superuser 用に
 * 設定されたものと一致する場合はそのロールを割り当てる(初期化救済も兼ねる)。
 */
export async function ensureUserDoc(decoded: {
  uid: string
  email?: string
  name?: string
  picture?: string
}): Promise<Role> {
  const config = useRuntimeConfig()
  const ownerEmail = (config.ownerEmail || '').toLowerCase()
  const superuserEmail = (config.superuserEmail || '').toLowerCase()
  const email = (decoded.email || '').toLowerCase()

  const ref = db.collection('users').doc(decoded.uid)
  const snap = await ref.get()

  if (!snap.exists) {
    let role: Role = 'user'
    // 一旦 owner も superuser 扱い(俺=owner を superuser に)。元に戻すときは owner を 'owner' へ。
    if (email && (email === ownerEmail || email === superuserEmail)) role = 'superuser'
    await ref.set({
      email: decoded.email || '',
      displayName: decoded.name || '',
      photoURL: decoded.picture || '',
      role,
      createdAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    })
    return role
  }

  const data = snap.data() || {}
  const updates: Record<string, any> = { lastLoginAt: FieldValue.serverTimestamp() }
  // 一旦 owner も superuser に昇格(元に戻すときはこの条件を見直す)
  if (email && (email === ownerEmail || email === superuserEmail) && data.role !== 'superuser') {
    updates.role = 'superuser'
  }
  await ref.set(updates, { merge: true })
  return (updates.role as Role) ?? (data.role as Role) ?? 'user'
}
