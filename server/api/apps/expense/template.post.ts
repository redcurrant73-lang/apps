import ExcelJS from 'exceljs'
import { getStorage } from 'firebase-admin/storage'
import { db } from '~/server/utils/firestore'
import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'

const PROJECT = process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || 'apps-498001'
const BUCKET = `${PROJECT}.firebasestorage.app`

const MAPPING_PROMPT = `以下は会社のExcel交通費精算書の各行の内容です。
列番号とセルの値を示します：

{HEADERS}

次のフィールドを、それぞれどの列番号（1始まり）に入力すれば良いか判定してください：
- date: 日付
- transportation: 交通手段・移動手段の種類
- from: 出発地
- to: 到着地（fromとtoが「区間」などとして同じセルに入る場合はcombinedRouteにその列番号を入れ、from/toはnull）
- combinedRoute: 出発地と到着地を「東京→大阪」のように1つにまとめる列（存在しない場合はnull）
- amount: 金額・運賃（数字）
- addressee: 宛名（新幹線領収書の宛名。ない場合はnull）
- notes: 備考・摘要（ない場合はnull）

また、ヘッダー行の行番号と、データを入力し始める行番号も教えてください。

以下のJSONのみで返してください：
{
  "headerRow": <ヘッダー行番号>,
  "dataStartRow": <データ入力開始行番号>,
  "columns": {
    "date": <列番号またはnull>,
    "transportation": <列番号またはnull>,
    "from": <列番号またはnull>,
    "to": <列番号またはnull>,
    "combinedRoute": <列番号またはnull>,
    "amount": <列番号またはnull>,
    "addressee": <列番号またはnull>,
    "notes": <列番号またはnull>
  }
}`

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)

  const { file, mimeType } = body
  if (!file || typeof file !== 'string') {
    throw createError({ statusCode: 400, message: 'Excelファイルが必要です' })
  }

  const buf = Buffer.from(file, 'base64')
  if (buf.length > 10 * 1024 * 1024) {
    throw createError({ statusCode: 413, message: 'ファイルが大きすぎます（10MB以下）' })
  }

  // Parse Excel to extract headers
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buf)
  } catch {
    throw createError({ statusCode: 400, message: 'Excelファイルを読み込めませんでした' })
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw createError({ statusCode: 400, message: 'シートが見つかりませんでした' })
  }

  // Extract first 15 rows for Gemini to analyze
  const headerLines: string[] = []
  for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= Math.min(20, worksheet.columnCount || 20); c++) {
      const val = row.getCell(c).value
      cells.push(val != null ? String(val) : '')
    }
    const nonEmpty = cells.filter((v) => v !== '')
    if (nonEmpty.length > 0) {
      headerLines.push(`行${r}: ` + cells.map((v, i) => `[${i + 1}]${v}`).filter((_, i) => cells[i] !== '').join('  '))
    }
  }

  const prompt = MAPPING_PROMPT.replace('{HEADERS}', headerLines.join('\n'))

  let r
  try {
    r = await getGemini().generateContent(prompt)
  } catch {
    throw createError({ statusCode: 503, message: 'テンプレートの解析に失敗しました' })
  }

  await recordGeminiUsage(
    r.response.usageMetadata?.promptTokenCount,
    r.response.usageMetadata?.candidatesTokenCount,
  ).catch(() => {})

  let mapping: any
  try {
    const cleaned = r.response.text().replace(/```(?:json)?\n?|\n?```/g, '').trim()
    mapping = JSON.parse(cleaned)
  } catch {
    throw createError({ statusCode: 500, message: 'テンプレートの列マッピングを読み取れませんでした' })
  }

  // Save template file to Cloud Storage
  const templateId = `template_${Date.now()}.xlsx`
  const path = `apps/expense/users/${decoded.uid}/${templateId}`
  await getStorage().bucket(BUCKET).file(path).save(buf, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    resumable: false,
  })

  // Save mapping to Firestore
  const ref = db.collection('apps/expense/users').doc(decoded.uid).collection('meta').doc('settings')
  await ref.set({ excelTemplateId: templateId, excelTemplateMapping: mapping }, { merge: true })

  return { ok: true, mapping }
})
