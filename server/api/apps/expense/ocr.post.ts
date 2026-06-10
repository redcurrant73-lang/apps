import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'

const PROMPT = `この画像は新幹線の領収書またはe-チケット・乗車記録です。
以下の情報を読み取り、JSONのみで返してください：

{
  "date": "乗車日をYYYY-MM-DD形式で（例：2024-03-15）",
  "from": "出発駅名（「駅」を除く。例：東京）",
  "to": "到着駅名（「駅」を除く。例：新大阪）",
  "amount": 運賃・料金（数字のみ。円マークや「円」不要。例：13850）,
  "trainName": "列車名または null（例：のぞみ123号）",
  "notes": "その他メモまたは null"
}

読み取れない項目は null にしてください。JSONのみ返してください。`

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const body = await readBody(event)

  const { image, mimeType } = body
  if (!image || typeof image !== 'string') {
    throw createError({ statusCode: 400, message: 'ファイルが必要です' })
  }

  const mime = String(mimeType || 'image/jpeg')

  let r
  try {
    r = await getGemini().chat({
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: mime, data: image } }, { text: PROMPT }],
        },
      ],
    })
  } catch {
    throw createError({ statusCode: 503, message: 'AI読み取りに失敗しました。もう一度お試しください。' })
  }

  await recordGeminiUsage(
    r.response.usageMetadata?.promptTokenCount,
    r.response.usageMetadata?.candidatesTokenCount,
  ).catch(() => {})

  const text = r.response.text()
  try {
    const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      date: parsed.date || null,
      from: parsed.from || null,
      to: parsed.to || null,
      amount: parsed.amount ? Number(parsed.amount) : null,
      trainName: parsed.trainName || null,
      notes: parsed.notes || null,
    }
  } catch {
    throw createError({ statusCode: 500, message: '領収書の読み取り結果を解析できませんでした。もう一度お試しください。' })
  }
})
