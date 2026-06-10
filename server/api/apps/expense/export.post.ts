import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { getStorage } from 'firebase-admin/storage'
import { db } from '~/server/utils/firestore'

const PROJECT = process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || 'apps-498001'
const BUCKET = `${PROJECT}.firebasestorage.app`

const SUBCATEGORY: Record<string, string> = {
  shinkansen: '新幹線代',
  train: '電車代',
  bus: 'バス代',
  taxi: 'タクシー代',
  other: 'その他',
}

function periodRange(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const startYear = m === 1 ? y - 1 : y
  const startMonth = m === 1 ? 12 : m - 1
  return {
    start: `${startYear}-${String(startMonth).padStart(2, '0')}-16`,
    end: `${y}-${String(m).padStart(2, '0')}-15`,
  }
}

function findTemplatePath(): string | null {
  const candidates = [
    resolve(process.cwd(), '.output', 'public', 'expense-template.xlsx'),
    resolve(process.cwd(), 'public', 'expense-template.xlsx'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)

  const { period } = body
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw createError({ statusCode: 400, message: '期間の指定が正しくありません（例: 2026-06）' })
  }

  const { start, end } = periodRange(period)
  const [y, m] = period.split('-').map(Number)

  try {
    const base = `apps/expense/users/${decoded.uid}/expenses`
    const snap = await db.collection(base)
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'asc')
      .get()
    const expenses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() as any }))

    const settingsRef = db.collection('apps/expense/users').doc(decoded.uid).collection('meta').doc('settings')
    const settingsSnap = await settingsRef.get()
    const templateId = settingsSnap.data()?.excelTemplateId || null

    const userSnap = await db.collection('users').doc(decoded.uid).get()
    const displayName = userSnap.data()?.displayName || '小西祐子'

    const workbook = new ExcelJS.Workbook()
    const sheetName = `${m}月精算分`

    // Step 1: try Cloud Storage template
    if (templateId) {
      const storagePath = `apps/expense/users/${decoded.uid}/${templateId}`
      try {
        const [buf] = await getStorage().bucket(BUCKET).file(storagePath).download()
        await workbook.xlsx.load(buf)
      } catch (e) {
        console.error('[expense/export] Cloud Storage load failed:', e)
        workbook.worksheets.forEach((ws) => workbook.removeWorksheet(ws.id))
      }
    }

    // Step 2: try bundled filesystem template
    if (workbook.worksheets.length === 0) {
      const p = findTemplatePath()
      console.log('[expense/export] cwd:', process.cwd(), 'template path:', p)
      if (p) {
        try {
          const buf = readFileSync(p)
          await workbook.xlsx.load(buf)
        } catch (e) {
          console.error('[expense/export] filesystem load failed:', e)
          workbook.worksheets.forEach((ws) => workbook.removeWorksheet(ws.id))
        }
      }
    }

    let ws: ExcelJS.Worksheet

    if (workbook.worksheets.length > 0) {
      ws = workbook.worksheets.find((s) => s.name === sheetName) || workbook.worksheets[0]
      ws.getCell(2, 11).value = new Date()
      ws.getCell(4, 11).value = displayName

      const DATA_START = 7
      const clearUntil = Math.max(DATA_START + expenses.length + 20, DATA_START + 40)
      for (let r = DATA_START; r <= clearUntil; r++) {
        const exp = expenses[r - DATA_START]
        const row = ws.getRow(r)
        if (exp) {
          row.getCell(1).value = r - DATA_START + 1
          row.getCell(2).value = new Date(exp.date + 'T00:00:00')
          row.getCell(3).value = '旅費交通費＿国内'
          row.getCell(4).value = exp.projectName || ''
          row.getCell(5).value = exp.payee || ''
          row.getCell(6).value = SUBCATEGORY[exp.type] || 'その他'
          row.getCell(7).value = `${exp.from}→${exp.to}`
          row.getCell(8).value = exp.direction === 'round' ? '往復' : '片道'
          row.getCell(9).value = exp.hasReceipt ? '〇' : '-'
          row.getCell(10).value = Number(exp.amount) || 0
          row.getCell(11).value = null
        } else {
          for (let c = 1; c <= 11; c++) row.getCell(c).value = null
        }
      }
    } else {
      // Minimal fallback — no template
      console.log('[expense/export] generating minimal workbook')
      ws = workbook.addWorksheet(sheetName)
      ws.getRow(2).getCell(10).value = '申請日'
      ws.getRow(2).getCell(11).value = new Date()
      ws.getRow(4).getCell(10).value = '申請者'
      ws.getRow(4).getCell(11).value = displayName

      const headers = ['No', '日付', '費目', '案件名', '支払先', '交通手段', '区間', '片道/往復', '領収書', '金額']
      const widths = [5, 13, 20, 12, 20, 12, 36, 10, 9, 12]
      const hRow = ws.getRow(6)
      headers.forEach((h, i) => {
        hRow.getCell(i + 1).value = h
        ws.getColumn(i + 1).width = widths[i]
      })

      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i]
        const row = ws.getRow(7 + i)
        row.getCell(1).value = i + 1
        row.getCell(2).value = new Date(exp.date + 'T00:00:00')
        row.getCell(3).value = '旅費交通費＿国内'
        row.getCell(4).value = exp.projectName || ''
        row.getCell(5).value = exp.payee || ''
        row.getCell(6).value = SUBCATEGORY[exp.type] || 'その他'
        row.getCell(7).value = `${exp.from}→${exp.to}`
        row.getCell(8).value = exp.direction === 'round' ? '往復' : '片道'
        row.getCell(9).value = exp.hasReceipt ? '〇' : '-'
        row.getCell(10).value = Number(exp.amount) || 0
      }
    }

    const buf = await workbook.xlsx.writeBuffer()
    const base64 = Buffer.from(buf as any).toString('base64')
    const [, sm] = start.split('-')
    return {
      base64,
      filename: `経費精算申請書_${m}月精算分.xlsx`,
      count: expenses.length,
      periodLabel: `${Number(sm)}月16日〜${m}月15日`,
    }
  } catch (e: any) {
    console.error('[expense/export] handler error:', e)
    throw createError({
      statusCode: 500,
      message: `[export] ${e?.message || String(e)}`,
    })
  }
})
