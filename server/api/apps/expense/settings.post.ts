import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)

  const ref = db.collection('apps/expense/users').doc(decoded.uid).collection('meta').doc('settings')
  const updates: Record<string, any> = {}

  if ('reportEmailTo' in body) updates.reportEmailTo = String(body.reportEmailTo || '')
  if ('savedAddressees' in body && Array.isArray(body.savedAddressees)) {
    updates.savedAddressees = body.savedAddressees.filter((a: any) => typeof a === 'string' && a.trim())
  }

  await ref.set(updates, { merge: true })
  return { ok: true }
})
