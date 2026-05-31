// ログイン後にクライアントから呼ばれる。
// ID Token を検証し、users/{uid} を用意して(初回作成・lastLoginAt 更新)ロールを返す。
// 一時的に詳細ログを出して、誰がいつ ensureUserDoc を通ってるか追えるようにしてある。
export default defineEventHandler(async (event) => {
  let decoded: any
  try {
    decoded = await requireAuth(event)
  } catch (e: any) {
    console.error('[auth/login] requireAuth failed:', e?.statusMessage || e?.message || e)
    throw e
  }
  try {
    const role = await ensureUserDoc(decoded)
    console.log(
      `[auth/login] OK uid=${decoded.uid} email=${decoded.email} role=${role}`,
    )
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      displayName: decoded.name ?? '',
      photoURL: decoded.picture ?? '',
      role,
    }
  } catch (e: any) {
    console.error(
      `[auth/login] ensureUserDoc FAILED uid=${decoded.uid} email=${decoded.email}:`,
      e?.message || e,
    )
    throw createError({
      statusCode: 500,
      message: `ユーザー登録に失敗: ${(e?.message || String(e)).slice(0, 200)}`,
    })
  }
})
