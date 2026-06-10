import ExcelJS from 'exceljs'
import { getStorage } from 'firebase-admin/storage'
import { db } from '~/server/utils/firestore'

const PROJECT = process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || 'apps-498001'
const BUCKET = `${PROJECT}.firebasestorage.app`

// Maps our transport type → 電車代・昼食代等 column value
const SUBCATEGORY: Record<string, string> = {
  shinkansen: '新幹線代',
  train: '電車代',
  bus: 'バス代',
  taxi: 'タクシー代',
  other: 'その他',
}
const DIRECTION_LABELS: Record<string, string> = {
  outbound: '片道',
  return: '片道',
  round: '往復',
  'one-way': '片道',
}

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)

  const { month } = body
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw createError({ statusCode: 400, message: '月の指定が正しくありません（例: 2024-01）' })
  }

  // Load expenses for the month
  const base = `apps/expense/users/${decoded.uid}/expenses`
  const start = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const snap = await db.collection(base)
    .where('date', '>=', start)
    .where('date', '<', nextMonth)
    .orderBy('date', 'asc')
    .get()

  const expenses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() as any }))

  // Load settings (for template)
  const settingsRef = db.collection('apps/expense/users').doc(decoded.uid).collection('meta').doc('settings')
  const settingsSnap = await settingsRef.get()
  const settings = settingsSnap.data() || {}
  const templateId = settings.excelTemplateId || null

  // Load user display name
  const userSnap = await db.collection('users').doc(decoded.uid).get()
  const displayName = userSnap.data()?.displayName || '小西祐子'

  const workbook = new ExcelJS.Workbook()
  let ws: ExcelJS.Worksheet

  if (templateId) {
    // Use the uploaded template
    const path = `apps/expense/users/${decoded.uid}/${templateId}`
    const [buf] = await getStorage().bucket(BUCKET).file(path).download()
    await workbook.xlsx.load(buf)

    // Find the target month sheet: e.g. "6月精算分"
    const sheetName = `${m}月精算分`
    ws = workbook.worksheets.find((s) => s.name === sheetName) || workbook.worksheets[0]

    // Fill 申請日 (row2, col11) and 申請者 (row4, col11)
    ws.getCell(2, 11).value = new Date()
    ws.getCell(4, 11).value = displayName

    // Data starts at row 7. Overwrite existing rows with new data, then blank out extras.
    const dataRowStart = 7
    const maxRows = Math.max(expenses.length + dataRowStart, 30) // clear up to at least row 30

    for (let r = dataRowStart; r <= maxRows; r++) {
      const exp = expenses[r - dataRowStart]
      const row = ws.getRow(r)
      if (exp) {
        row.getCell(1).value = r - dataRowStart + 1          // No
        row.getCell(2).value = new Date(exp.date + 'T00:00:00') // 日付
        row.getCell(3).value = '旅費交通費＿国内'              // 費目
        row.getCell(4).value = exp.projectName || ''           // 案件名
        row.getCell(5).value = exp.payee || ''                 // 支払先
        row.getCell(6).value = SUBCATEGORY[exp.type] || 'その他' // 電車代・昼食代等
        row.getCell(7).value = `${exp.from}→${exp.to}`        // 詳細・備考
        row.getCell(8).value = DIRECTION_LABELS[exp.direction] || '片道' // 片道 往復
        row.getCell(9).value = exp.hasReceipt ? '〇' : '-'    // 領収書
        row.getCell(10).value = Number(exp.amount) || 0        // 金額
        row.getCell(11).value = null                            // ガソリン代距離
      } else {
        // Clear extra rows that had template placeholders
        for (let c = 1; c <= 11; c++) {
          const cell = row.getCell(c)
          if (c !== 9) cell.value = null  // keep 9 structure but clear value
          else cell.value = null
        }
      }
      row.commit()
    }
  } else {
    // No template: generate a simple default format
    ws = workbook.addWorksheet(`${m}月精算分`)
    ws.mergeCells('A1:K1')
    ws.getCell('A1').value = '経費精算申請書'
    ws.getCell('A1').font = { bold: true, size: 14 }
    ws.getCell('A1').alignment = { horizontal: 'center' }

    ws.getCell('J2').value = '申請日'; ws.getCell('K2').value = new Date()
    ws.getCell('J4').value = '申請者'; ws.getCell('K4').value = displayName

    const headers = ['No', '日付', '費目', '案件名', '支払先', '電車代・昼食代等', '詳細・備考（区間・経由駅・行き先など）', '片道 往復', '領収書', '金額', 'ガソリン代 距離（km）']
    const widths = [5, 13, 20, 12, 20, 16, 32, 10, 9, 12, 20]
    const hRow = ws.addRow([]); ws.addRow([]); ws.addRow([]); ws.addRow([])
    ws.addRow([]); ws.addRow([])
    const headerRow = ws.getRow(6)
    headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; ws.getColumn(i + 1).width = widths[i] })
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E4FF' } }
    headerRow.commit()

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
      row.getCell(8).value = DIRECTION_LABELS[exp.direction] || '片道'
      row.getCell(9).value = exp.hasReceipt ? '〇' : '-'
      row.getCell(10).value = Number(exp.amount) || 0
      row.commit()
    }
  }

  const buf = await workbook.xlsx.writeBuffer()
  const base64 = Buffer.from(buf).toString('base64')

  return {
    base64,
    filename: `経費精算申請書_${y}年${m}月.xlsx`,
    count: expenses.length,
  }
})
