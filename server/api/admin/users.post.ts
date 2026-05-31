// ユーザー管理操作(ロール変更・削除)。superuser / owner のみ。
// owner ロールの付与は owner 本人のみ可能。
import { FieldValue } from 'firebase-admin/firestore'

const ROLES = ['owner', 'superuser', 'user'] as const

export default defineEventHandler(async (event) => {
  const me = await requireSuperuser(event)
  const myRole = await getUserRole(me.uid)
  const body = await readBody(event)
  const action = String(body?.action ?? '')
  const uid = String(body?.uid ?? '')

  if (!uid) throw createError({ statusCode: 400, message: 'uid がありません' })

  if (action === 'setRole') {
    const role = String(body?.role ?? '')
    if (!ROLES.includes(role as any)) {
      throw createError({ statusCode: 400, message: '不正なロールです' })
    }
    if (role === 'owner' && myRole !== 'owner') {
      throw createError({ statusCode: 403, message: 'owner を付与できるのは owner だけです' })
    }
    if (uid === me.uid && role === 'user') {
      throw createError({ statusCode: 400, message: '自分自身を降格することはできません' })
    }
    await db.collection('users').doc(uid).set(
      { role, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    return { ok: true }
  }

  if (action === 'delete') {
    if (uid === me.uid) {
      throw createError({ statusCode: 400, message: '自分自身は削除できません' })
    }
    // ユーザーと、そのアクセス権(appAccess)をまとめて削除
    const accessSnap = await db.collection('appAccess').where('uid', '==', uid).get()
    const batch = db.batch()
    accessSnap.forEach((d) => batch.delete(d.ref))
    batch.delete(db.collection('users').doc(uid))
    await batch.commit()
    return { ok: true }
  }

  throw createError({ statusCode: 400, message: '不明な操作です' })
})
