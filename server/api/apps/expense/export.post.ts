import ExcelJS from 'exceljs'
import { getStorage } from 'firebase-admin/storage'
import { db } from '~/server/utils/firestore'

const PROJECT = process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || 'apps-498001'
const BUCKET = `${PROJECT}.firebasestorage.app`

const TRANSPORT_LABELS: Record<string, string> = {
  shinkansen: '新幹線',
  train: '電車',
  bus: 'バス',
  taxi: 'タクシー',
  other: 'その他',
}
const DIRECTION_LABELS: Record<string, string> = {
  outbound: '行き',
  return: '帰り',
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

  // Load settings
  const settingsRef = db.collection('apps/expense/users').doc(decoded.uid).collection('meta').doc('settings')
  const settingsSnap = await settingsRef.get()
  const settings = settingsSnap.data() || {}
  const mapping = settings.excelTemplateMapping || null
  const templateId = settings.excelTemplateId || null

  const workbook = new ExcelJS.Workbook()

  if (templateId && mapping) {
    // Use uploaded template
    const path = `apps/expense/users/${decoded.uid}/${templateId}`
    const [buf] = await getStorage().bucket(BUCKET).file(path).download()
    await workbook.xlsx.load(buf)

    const ws = workbook.worksheets[0]
    const dataStart = Number(mapping.dataStartRow) || 2
    const cols = mapping.columns || {}

    // Copy style from first data row if it exists (as template for new rows)
    const templateRow = ws.getRow(dataStart)
    const templateStyles: Record<number, Partial<ExcelJS.Style>> = {}
    templateRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (cell.style) {
        try { templateStyles[colNum] = JSON.parse(JSON.stringify(cell.style)) } catch {}
      }
    })

    // Clear existing data rows (keep header rows)
    for (let r = ws.rowCount; r >= dataStart; r--) {
      ws.spliceRows(r, 1)
    }

    // Insert expense rows
    for (const exp of expenses) {
      const rowData: any[] = []
      const maxCol = Math.max(
        ...[cols.date, cols.transportation, cols.from, cols.to, cols.combinedRoute, cols.amount, cols.addressee, cols.notes]
          .filter(Boolean).map(Number),
        1,
      )
      for (let c = 1; c <= maxCol; c++) rowData.push('')

      const set = (col: number | undefined | null, val: any) => {
        if (col && col > 0) rowData[col - 1] = val
      }

      const d = String(exp.date || '')
      set(cols.date, d)
      set(cols.transportation, TRANSPORT_LABELS[exp.type] || exp.type || '')

      if (cols.combinedRoute) {
        set(cols.combinedRoute, exp.from && exp.to ? `${exp.from}→${exp.to}` : (exp.from || exp.to || ''))
      } else {
        set(cols.from, exp.from || '')
        set(cols.to, exp.to || '')
      }

      set(cols.amount, Number(exp.amount) || 0)
      set(cols.addressee, exp.addressee || '')
      set(cols.notes, [exp.notes, DIRECTION_LABELS[exp.direction]].filter(Boolean).join(' ') || '')

      const row = ws.addRow(rowData)
      // Apply template styles
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (templateStyles[colNum]) {
          try { cell.style = JSON.parse(JSON.stringify(templateStyles[colNum])) } catch {}
        }
      })
    }
  } else {
    // Default template (no uploaded template)
    const ws = workbook.addWorksheet('交通費')
    const [y2, m2] = month.split('-').map(Number)
    ws.mergeCells('A1:H1')
    ws.getCell('A1').value = `${y2}年${m2}月 交通費精算書`
    ws.getCell('A1').font = { bold: true, size: 14 }
    ws.getCell('A1').alignment = { horizontal: 'center' }

    const headers = ['日付', '交通手段', '出発地', '到着地', '区間（まとめ）', '金額（円）', '宛名', '備考']
    const widths = [14, 12, 16, 16, 22, 14, 16, 20]
    ws.addRow([])
    const hRow = ws.addRow(headers)
    hRow.font = { bold: true }
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E4FF' } }
    headers.forEach((_, i) => { ws.getColumn(i + 1).width = widths[i] })

    for (const exp of expenses) {
      ws.addRow([
        exp.date || '',
        TRANSPORT_LABELS[exp.type] || exp.type || '',
        exp.from || '',
        exp.to || '',
        exp.from && exp.to ? `${exp.from}→${exp.to}` : '',
        Number(exp.amount) || 0,
        exp.addressee || '',
        [exp.notes, DIRECTION_LABELS[exp.direction]].filter(Boolean).join(' '),
      ])
    }

    // Total row
    const totalRow = ws.addRow(['合計', '', '', '', '', { formula: `SUM(F4:F${3 + expenses.length})` }, '', ''])
    totalRow.font = { bold: true }
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0C0' } }
  }

  const buf = await workbook.xlsx.writeBuffer()
  const base64 = Buffer.from(buf).toString('base64')

  const [y2, m2] = month.split('-').map(Number)
  return {
    base64,
    filename: `交通費報告書_${y2}年${m2}月.xlsx`,
    count: expenses.length,
  }
})
