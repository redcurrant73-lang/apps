import { db } from '~/server/utils/firestore'
import { getKaisekiOwnerUid } from './_ownerUid'

export default defineEventHandler(async (event) => {
  await requireAppAccess(event, 'kaiseki')
  const ownerUid = await getKaisekiOwnerUid()

  const snap = await db
    .collection(`apps/kaiseki/users/${ownerUid}/menus`)
    .orderBy('createdAt', 'desc')
    .get()

  return snap.docs.map((doc) => {
    const data = doc.data()
    const createdAt = data.createdAt?.toDate?.()?.toISOString?.() ?? null
    return {
      id: doc.id,
      title: data.title ?? '',
      imageId: data.imageId ?? '',
      dishCount: Array.isArray(data.dishes) ? data.dishes.length : 0,
      createdAt,
    }
  })
})
