import { db } from '~/server/utils/firestore'
import { deleteImage } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'IDが必要です' })

  const base = `apps/expense/users/${decoded.uid}/expenses`
  const ref = db.collection(base).doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw createError({ statusCode: 404, message: '見つかりません' })

  const data = snap.data() || {}
  if (data.receiptImageId) {
    await deleteImage({ appId: 'expense', uid: decoded.uid, imageId: data.receiptImageId }).catch(() => {})
  }

  await ref.delete()
  return { ok: true }
})
