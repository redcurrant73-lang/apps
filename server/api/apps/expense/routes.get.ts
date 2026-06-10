import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const base = `apps/expense/users/${decoded.uid}/routes`
  const snap = await db.collection(base).orderBy('createdAt', 'desc').get()
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
})
