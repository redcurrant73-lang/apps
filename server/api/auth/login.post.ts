// ログイン後にクライアントから呼ばれる。
// ID Token を検証し、users/{uid} を用意して(初回作成・lastLoginAt 更新)ロールを返す。
export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const role = await ensureUserDoc(decoded)
  return {
    uid: decoded.uid,
    email: decoded.email ?? '',
    displayName: decoded.name ?? '',
    photoURL: decoded.picture ?? '',
    role,
  }
})
