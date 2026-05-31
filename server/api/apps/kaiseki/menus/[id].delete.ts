import { db } from '~/server/utils/firestore'
import { deleteImage } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const docRef = db.doc(`apps/kaiseki/users/${decoded.uid}/menus/${id}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  const imageId = doc.data()?.imageId
  await docRef.delete()

  if (imageId) {
    await deleteImage({ appId: 'kaiseki', uid: decoded.uid, imageId }).catch(() => {})
  }

  return { ok: true }
})
