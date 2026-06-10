import { FieldValue } from 'firebase-admin/firestore'
import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)

  const { date, type, from, to, amount, direction, addressee, notes, receiptImageId, projectName, payee, hasReceipt } = body

  if (!date || !from || !to || !amount) {
    throw createError({ statusCode: 400, message: '日付・出発地・到着地・金額は必須です' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, message: '日付の形式が正しくありません' })
  }
  const amountNum = Number(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    throw createError({ statusCode: 400, message: '金額は正の数を入力してください' })
  }

  const base = `apps/expense/users/${decoded.uid}/expenses`
  const docRef = await db.collection(base).add({
    date,
    type: type || 'train',
    from,
    to,
    amount: amountNum,
    direction: direction || 'one-way',
    addressee: addressee || null,
    notes: notes || null,
    receiptImageId: receiptImageId || null,
    projectName: projectName || null,
    payee: payee || null,
    hasReceipt: hasReceipt ?? false,
    createdAt: FieldValue.serverTimestamp(),
  })

  return { id: docRef.id }
})
