// Helper(AI チャット)エンドポイント。
//
// - visibility=always_visible なのでログイン済みなら誰でも使える
// - 画像つきメッセージに対応(Vertex AI Gemini はマルチモーダル)
// - 会話履歴は Firestore に保存し、20ターン超過は要約に折り畳む
// - コスト管理:画像/履歴を肥大化させないよう、要約後の overflow 画像は削除
import { getGemini } from '~/server/utils/gemini'
import { loadReadmesForUser } from '~/server/utils/readmes'
import {
  loadState,
  saveState,
  compressIfNeeded,
  type HelperMessage,
} from '~/server/utils/helper-state'
import { saveImage, readImage } from '~/server/utils/storage'

interface IncomingImage {
  base64: string
  mimeType?: string
}

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const body = await readBody(event)
  const question = String(body?.question ?? body?.message ?? '').trim()
  const image: IncomingImage | null = body?.image && body.image.base64 ? body.image : null

  if (!question && !image) {
    throw createError({ statusCode: 400, message: 'メッセージまたは画像が必要です' })
  }

  const state = await loadState(decoded.uid)
  const apps = await loadReadmesForUser(decoded.uid)
  const appContext = apps.length
    ? apps.map((a) => `### ${a.title} (id: ${a.id})\n${a.content}`).join('\n\n')
    : '(このユーザーが今使えるミニアプリはまだありません)'

  // ---- 画像があれば Storage に圧縮済みで保存 ----
  let savedImageId: string | undefined
  let inlineImage: { mimeType: string; data: string } | undefined
  if (image) {
    const { imageId } = await saveImage({
      appId: 'helper',
      uid: decoded.uid,
      base64: image.base64,
      mimeType: image.mimeType,
    })
    savedImageId = imageId
    inlineImage = { mimeType: image.mimeType || 'image/jpeg', data: image.base64 }
  }

  // ---- Gemini への入力を組み立てる ----
  const persona = [
    'あなたは小西祐子さんのミニアプリ・ポータル「apps」のヘルパーです。',
    'やさしい日本語で簡潔に答えてください。',
    '- 利用可能なアプリのドキュメントだけを根拠にする。',
    '- まだ存在しないアプリについて聞かれたら「まだそのアプリはありません」と正直に答える。',
    '- 専門用語(プログラムやインフラの用語)は使わない。',
    '- ユーザーが「新しいアプリを作りたい」と言ったら、用途・公開範囲・データの持ち方・通知や写真の要否を1つずつ質問して要件をまとめ、',
    '  最後に「Claude Codeへの指示書」を ```text コードブロックで提示する。',
    '',
    '# 利用可能なアプリのドキュメント',
    appContext,
    state.summary ? '\n# これまでの会話の要約\n' + state.summary : '',
  ].join('\n')

  // 履歴を Gemini 形式に変換(画像実体は履歴では送らない=コスト/帯域節約)
  const historyContents = state.messages.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.imageId ? `[画像を共有しました] ${m.text}` : m.text }],
  }))

  // 今回の新メッセージ
  const userParts: any[] = []
  if (inlineImage) userParts.push({ inlineData: inlineImage })
  userParts.push({ text: question || '(この画像について教えて)' })

  const contents = [
    ...historyContents,
    { role: 'user' as const, parts: userParts },
  ]

  // ---- Gemini を呼ぶ ----
  let answer: string
  let usage: any = null
  try {
    const r = await getGemini().chat({
      contents,
      systemInstruction: { parts: [{ text: persona }] },
    })
    answer = r.response.text()
    usage = r.response.usageMetadata
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error('[helper/chat] gemini error:', msg)
    throw createError({
      statusCode: 502,
      message: `AIへの問い合わせに失敗しました: ${msg.slice(0, 200)}`,
    })
  }

  // ---- 状態を更新 & 必要なら圧縮 ----
  const now = Date.now()
  const userMsg: HelperMessage = { role: 'user', text: question, createdAt: now }
  if (savedImageId) userMsg.imageId = savedImageId
  const newMessages: HelperMessage[] = [
    ...state.messages,
    userMsg,
    { role: 'assistant', text: answer, createdAt: now + 1 },
  ]
  let newState = { messages: newMessages, summary: state.summary }
  newState = await compressIfNeeded(decoded.uid, newState)
  await saveState(decoded.uid, newState)

  // ---- 使用量を記録(失敗しても応答は返す)----
  try {
    const { recordGeminiUsage } = await import('~/server/utils/billing')
    await recordGeminiUsage(usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0)
  } catch {
    // noop
  }

  return { answer, imageId: savedImageId }
})
