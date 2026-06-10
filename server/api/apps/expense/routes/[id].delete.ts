import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'IDが必要です' })

  const base = `apps/expense/users/${decoded.uid}/routes`
  await db.collection(base).doc(id).delete()
  return { ok: true }
})
