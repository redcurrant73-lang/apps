import { db, serializeDoc } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const doc = await db.doc(`apps/kaiseki/users/${decoded.uid}/menus/${id}`).get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  return serializeDoc(doc.id, doc.data())
})
