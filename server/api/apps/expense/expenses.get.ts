import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const { month } = getQuery(event) as { month?: string }

  const base = `apps/expense/users/${decoded.uid}/expenses`
  let query = db.collection(base).orderBy('date', 'asc')

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.where('date', '>=', start).where('date', '<', nextMonth) as any
  }

  const snap = await query.get()
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
})
