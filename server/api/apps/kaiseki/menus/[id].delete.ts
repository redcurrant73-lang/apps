import { db } from '~/server/utils/firestore'
import { deleteImage } from '~/server/utils/storage'
import { getKaisekiOwnerUid } from '../_ownerUid'

export default defineEventHandler(async (event) => {
  await requireAppAccess(event, 'kaiseki')
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const ownerUid = await getKaisekiOwnerUid()
  const docRef = db.doc(`apps/kaiseki/users/${ownerUid}/menus/${id}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  const imageId = doc.data()?.imageId
  await docRef.delete()

  if (imageId) {
    await deleteImage({ appId: 'kaiseki', uid: ownerUid, imageId }).catch(() => {})
  }

  return { ok: true }
})
