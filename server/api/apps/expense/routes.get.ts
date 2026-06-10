import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { db } from '~/server/utils/firestore'

const PROJECT = process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || 'apps-498001'
const BUCKET = `${PROJECT}.firebasestorage.app`

const DEFAULT_ROUTES = [
  { name: 'バス：自宅→目黒駅',     from: 'サレジオ教会', to: '目黒駅',    type: 'bus',       amount: 250,  payee: '東急バス株式会社', projectName: '箱根', hasReceipt: false },
  { name: '電車：目黒→品川',        from: '目黒',         to: '品川',      type: 'train',     amount: 199,  payee: 'JR東日本',         projectName: '箱根', hasReceipt: false },
  { name: '新幹線：品川→小田原',    from: '品川',         to: '小田原',    type: 'shinkansen',amount: 3100, payee: 'JR東海',           projectName: '箱根', hasReceipt: true  },
  { name: '電車：小田原→彫刻の森',  from: '小田原',       to: '彫刻の森',  type: 'train',     amount: 770,  payee: '小田原箱根',       projectName: '箱根', hasReceipt: false },
  { name: '電車：彫刻の森→小田原',  from: '彫刻の森',     to: '小田原',    type: 'train',     amount: 770,  payee: '小田原箱根',       projectName: '箱根', hasReceipt: false },
  { name: '新幹線：小田原→品川',    from: '小田原',       to: '品川',      type: 'shinkansen',amount: 3100, payee: 'JR東海',           projectName: '箱根', hasReceipt: true  },
  { name: '電車：品川→目黒',        from: '品川',         to: '目黒',      type: 'train',     amount: 199,  payee: 'JR東日本',         projectName: '箱根', hasReceipt: false },
  { name: 'バス：目黒駅→自宅',      from: '目黒駅',       to: 'サレジオ教会', type: 'bus',    amount: 250,  payee: '東急バス株式会社', projectName: '箱根', hasReceipt: false },
]

async function seedIfNeeded(uid: string) {
  const settingsRef = db.collection('apps/expense/users').doc(uid).collection('meta').doc('settings')
  const snap = await settingsRef.get()
  const settings = snap.data() || {}

  if (settings.hasBeenSeeded) return

  const routeBase = `apps/expense/users/${uid}/routes`
  const batch = db.batch()

  for (const r of DEFAULT_ROUTES) {
    const ref = db.collection(routeBase).doc()
    batch.set(ref, { ...r, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  }

  batch.set(settingsRef, {
    hasBeenSeeded: true,
    savedProjectNames: ['箱根'],
    defaultProjectName: '箱根',
    savedAddressees: ['小西祐子'],
  }, { merge: true })

  // Upload the bundled template to Cloud Storage if not already there
  if (!settings.excelTemplateId) {
    try {
      const candidatePaths = [
        resolve(process.cwd(), '.output', 'public', 'expense-template.xlsx'),
        resolve(process.cwd(), 'public', 'expense-template.xlsx'),
      ]
      let templateBuf: Buffer | null = null
      for (const p of candidatePaths) {
        try { templateBuf = readFileSync(p); break } catch {}
      }
      if (!templateBuf) throw new Error('template not found')
      const templateId = `template_default.xlsx`
      const storagePath = `apps/expense/users/${uid}/${templateId}`
      await getStorage().bucket(BUCKET).file(storagePath).save(templateBuf, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        resumable: false,
      })
      batch.set(settingsRef, { excelTemplateId: templateId }, { merge: true })
    } catch {}
  }

  await batch.commit()
}

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)

  await seedIfNeeded(decoded.uid).catch(() => {})

  const base = `apps/expense/users/${decoded.uid}/routes`
  const snap = await db.collection(base).orderBy('createdAt', 'asc').get()
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
})
