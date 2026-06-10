import { db } from '~/server/utils/firestore'

// 締め日15日: 「6月精算分」= 5/16〜6/15
function periodRange(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const startYear = m === 1 ? y - 1 : y
  const startMonth = m === 1 ? 12 : m - 1
  return {
    start: `${startYear}-${String(startMonth).padStart(2, '0')}-16`,
    end: `${y}-${String(m).padStart(2, '0')}-15`,
  }
}

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const { period } = getQuery(event) as { period?: string }

  const base = `apps/expense/users/${decoded.uid}/expenses`
  let query = db.collection(base).orderBy('date', 'asc') as any

  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const { start, end } = periodRange(period)
    query = query.where('date', '>=', start).where('date', '<=', end)
  }

  const snap = await query.get()
  return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
})
