import { FieldValue } from 'firebase-admin/firestore'
import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)

  const { id, name, from, to, type, amount, payee, projectName, hasReceipt } = body
  if (!name || !from || !to || !amount) {
    throw createError({ statusCode: 400, message: 'ルート名・出発地・到着地・金額は必須です' })
  }

  const base = `apps/expense/users/${decoded.uid}/routes`
  const data = {
    name,
    from,
    to,
    type: type || 'train',
    amount: Number(amount),
    payee: payee || null,
    projectName: projectName || null,
    hasReceipt: hasReceipt ?? false,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (id) {
    await db.collection(base).doc(id).set(data, { merge: true })
    return { id }
  } else {
    const ref = await db.collection(base).add({ ...data, createdAt: FieldValue.serverTimestamp() })
    return { id: ref.id }
  }
})
