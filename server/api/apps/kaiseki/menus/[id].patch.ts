import { db } from '~/server/utils/firestore'
import { getKaisekiOwnerUid } from '../_ownerUid'

export default defineEventHandler(async (event) => {
  await requireAppAccess(event, 'kaiseki')
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const body = await readBody(event)
  const ownerUid = await getKaisekiOwnerUid()
  const docRef = db.doc(`apps/kaiseki/users/${ownerUid}/menus/${id}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  // カテゴリー順の更新
  if (Array.isArray(body?.categoryOrder)) {
    await docRef.update({ categoryOrder: body.categoryOrder })
    return { ok: true }
  }

  // 料理情報の更新
  const { dishIndex, nameJa, reading, descriptionJa } = body ?? {}

  if (typeof dishIndex !== 'number') {
    throw createError({ statusCode: 400, message: '料理のインデックスが必要です' })
  }

  const dishes: any[] = [...(doc.data()?.dishes || [])]

  if (dishIndex < 0 || dishIndex >= dishes.length) {
    throw createError({ statusCode: 400, message: '不正な料理インデックスです' })
  }

  // 用語の更新
  if (typeof body?.termIndex === 'number') {
    const { termIndex, word, explanation } = body
    const terms = [...(dishes[dishIndex].terms || [])]
    if (termIndex < 0 || termIndex >= terms.length) {
      throw createError({ statusCode: 400, message: '不正な用語インデックスです' })
    }
    terms[termIndex] = {
      ...terms[termIndex],
      ...(typeof word === 'string' ? { word } : {}),
      ...(typeof reading === 'string' ? { reading } : {}),
      ...(typeof explanation === 'string' ? { explanation } : {}),
    }
    dishes[dishIndex] = { ...dishes[dishIndex], terms }
    await docRef.update({ dishes })
    return { ok: true }
  }

  // 料理情報の更新
  dishes[dishIndex] = {
    ...dishes[dishIndex],
    ...(typeof nameJa === 'string' ? { nameJa } : {}),
    ...(typeof reading === 'string' ? { reading } : {}),
    ...(typeof descriptionJa === 'string' ? { descriptionJa } : {}),
  }

  await docRef.update({ dishes })

  return { ok: true }
})
