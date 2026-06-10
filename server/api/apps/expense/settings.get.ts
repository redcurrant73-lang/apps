import { db } from '~/server/utils/firestore'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const ref = db.collection('apps/expense/users').doc(decoded.uid).collection('meta').doc('settings')
  const snap = await ref.get()
  const data = snap.data() || {}
  return {
    savedAddressees: data.savedAddressees || [],
    reportEmailTo: data.reportEmailTo || '',
    hasTemplate: !!data.excelTemplateId,
    excelTemplateMapping: data.excelTemplateMapping || null,
  }
})
