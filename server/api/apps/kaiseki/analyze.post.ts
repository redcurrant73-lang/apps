import { FieldValue } from 'firebase-admin/firestore'
import { db } from '~/server/utils/firestore'
import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'
import { saveImage, deleteImage } from '~/server/utils/storage'

const PROMPT = `あなたは日本料理の専門家です。この画像は懐石料理のお品書きです。

画像に写っているすべての料理を読み取り、以下のJSON形式のみで返してください：

{
  "dishes": [
    {
      "nameJa": "料理名（画像の文字をそのまま）",
      "reading": "読み方（ひらがなのみ）",
      "category": "カテゴリー（先付/八寸/お椀/向付/お造り/焼物/煮物/揚物/蒸物/御飯/水物/甘味 から最適なもの）",
      "descriptionJa": "料理名の下に書かれている食材・注記などの文章をそのまま転記する。何も書かれていなければ空文字",
      "terms": [
        {
          "word": "専門用語・特殊食材名（漢字）",
          "reading": "読み方（ひらがな）",
          "explanation": "2〜3文の丁寧な説明。日本人でも知らないかもしれない専門的な内容を書く"
        }
      ],
      "nameEn": "English name（ファインダイニング風）",
      "categoryEn": "English category（Amuse-Bouche/Appetizer/Soup/Sashimi/Grilled/Simmered/Fried/Steamed/Rice Course/Seasonal Fruits/Dessert から最適なもの）",
      "descriptionEn": "English description（2-3 sentences, fine dining style）"
    }
  ]
}

注意事項：
- お品書きに記載されているすべての料理を、メニューの順番通りに含めること
- descriptionJa はお品書きに実際に書かれているテキストのみ転記する。AIによる解説・補足は一切加えない
- terms には、その料理に使われる専門用語・珍しい食材・伝統的な調理名など、説明が必要な言葉を1〜4個入れる（鼈甲餡・丸中・松前漬け・薯蕷などが例）
- 一般的な言葉（醤油・白米など）は terms に入れない
- termsが特にない料理は空配列 [] にする

英語名（nameEn）のルール：
- 真丈・茶巾・饅頭など魚介や豆腐のすり身を成形した料理はすべて "Dumpling" を使う（例: "Sea Bream Dumpling"、"Tofu Dumpling in Clear Soup"）
- 魚の名前は必ず英語に訳してタイトルに含める（例: 鱧→Pike Conger、鯛→Sea Bream、鰹→Bonito、鮭→Salmon、鮎→Sweetfish、鰻→Eel、鱸→Sea Bass、鰤→Yellowtail、鮪→Tuna、鯖→Mackerel、鰈→Flounder、車海老→Tiger Prawn、伊勢海老→Lobster）
- JSONのみ返すこと`

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const body = await readBody(event)

  const image = body?.image
  const mimeType = String(body?.mimeType || 'image/jpeg')

  if (!image || typeof image !== 'string') {
    throw createError({ statusCode: 400, message: '画像が必要です' })
  }

  const { imageId } = await saveImage({
    appId: 'kaiseki',
    uid: decoded.uid,
    base64: image,
    mimeType,
  })

  let r
  try {
    r = await getGemini().chat({
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: image } }, { text: PROMPT }],
        },
      ],
    })
  } catch {
    await deleteImage({ appId: 'kaiseki', uid: decoded.uid, imageId }).catch(() => {})
    throw createError({ statusCode: 503, message: 'AI解析に失敗しました。もう一度お試しください。' })
  }

  const text = r.response.text()
  await recordGeminiUsage(
    r.response.usageMetadata?.promptTokenCount,
    r.response.usageMetadata?.candidatesTokenCount,
  ).catch(() => {})

  let dishes: any[] = []
  try {
    const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    dishes = Array.isArray(parsed.dishes) ? parsed.dishes : []
  } catch {
    await deleteImage({ appId: 'kaiseki', uid: decoded.uid, imageId }).catch(() => {})
    throw createError({ statusCode: 500, message: 'メニューの解析結果を読み取れませんでした。もう一度お試しください。' })
  }

  if (dishes.length === 0) {
    await deleteImage({ appId: 'kaiseki', uid: decoded.uid, imageId }).catch(() => {})
    throw createError({ statusCode: 422, message: 'お品書きの料理を読み取れませんでした。写真を確認してもう一度お試しください。' })
  }

  const now = new Date()
  const title = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`

  const docRef = await db.collection(`apps/kaiseki/users/${decoded.uid}/menus`).add({
    title,
    imageId,
    dishes,
    createdAt: FieldValue.serverTimestamp(),
  })

  return { id: docRef.id, title, imageId, dishes }
})
