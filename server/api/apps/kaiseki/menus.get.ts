import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)

  const snap = await db
    .collection(`apps/kaiseki/users/${decoded.uid}/menus`)
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
