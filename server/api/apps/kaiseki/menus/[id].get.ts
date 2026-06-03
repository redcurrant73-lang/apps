import { db, serializeDoc } from '~/server/utils/firestore'
import { getKaisekiOwnerUid } from '../_ownerUid'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const ownerUid = await getKaisekiOwnerUid()
  const doc = await db.doc(`apps/kaiseki/users/${ownerUid}/menus/${id}`).get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  return serializeDoc(doc.id, doc.data())
})
