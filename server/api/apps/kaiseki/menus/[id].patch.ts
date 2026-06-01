import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const body = await readBody(event)
  const { dishIndex, nameJa, reading, descriptionJa } = body ?? {}

  if (typeof dishIndex !== 'number') {
    throw createError({ statusCode: 400, message: '料理のインデックスが必要です' })
  }

  const docRef = db.doc(`apps/kaiseki/users/${decoded.uid}/menus/${id}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  const dishes: any[] = [...(doc.data()?.dishes || [])]

  if (dishIndex < 0 || dishIndex >= dishes.length) {
    throw createError({ statusCode: 400, message: '不正な料理インデックスです' })
  }

  dishes[dishIndex] = {
    ...dishes[dishIndex],
    ...(typeof nameJa === 'string' ? { nameJa } : {}),
    ...(typeof reading === 'string' ? { reading } : {}),
    ...(typeof descriptionJa === 'string' ? { descriptionJa } : {}),
  }

  await docRef.update({ dishes })

  return { ok: true }
})
