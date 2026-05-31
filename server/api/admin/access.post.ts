// アクセス権の ON/OFF。superuser / owner のみ。
import { FieldValue } from 'firebase-admin/firestore'

export default defineEventHandler(async (event) => {
  const me = await requireSuperuser(event)
  const body = await readBody(event)
  const uid = String(body?.uid ?? '')
  const appId = String(body?.appId ?? '')
  const grant = Boolean(body?.grant)

  if (!uid || !appId) {
    throw createError({ statusCode: 400, message: 'uid と appId が必要です' })
  }

  const id = `${uid}_${appId}`
  const ref = db.collection('appAccess').doc(id)

  if (grant) {
    await ref.set({
      uid,
      appId,
      grantedBy: me.uid,
      grantedAt: FieldValue.serverTimestamp(),
    })
  } else {
    await ref.delete()
  }

  return { ok: true, uid, appId, grant }
})
