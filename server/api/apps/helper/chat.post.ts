// Helper(AIアシスタント)のチャット。
// ユーザーがアクセスできるアプリの README だけをコンテキストに含めて Gemini に渡す。
export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const body = await readBody(event)
  const question = String(body?.question ?? body?.message ?? '').trim()
  const history: { role: string; text: string }[] = Array.isArray(body?.history) ? body.history : []

  if (!question) {
    throw createError({ statusCode: 400, message: '質問が空です' })
  }

  const apps = await loadReadmesForUser(decoded.uid)
  const appContext = apps.length
    ? apps.map((a) => `### ${a.title} (id: ${a.id})\n${a.content}`).join('\n\n')
    : '(このユーザーが今使えるミニアプリはまだありません)'

  const historyText = history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'ユーザー' : 'ヘルパー'}: ${h.text}`)
    .join('\n')

  const prompt = [
    'あなたは小西祐子さんのミニアプリ・ポータル「apps」のヘルパーです。',
    '以下のルールで、やさしい日本語で簡潔に答えてください。',
    '- 利用可能なアプリのドキュメントだけを根拠にする。',
    '- まだ存在しないアプリについて聞かれたら「まだそのアプリはありません」と正直に答える。',
    '- 専門用語(プログラムやインフラの用語)は使わない。',
    '- ユーザーが「新しいアプリを作りたい」と言ったら、用途・公開範囲・データの持ち方・通知や写真の要否を1つずつ質問して要件をまとめ、',
    '  最後に「Claude Codeへの指示書」を ```text コードブロックで提示する(ユーザーがコピーして開発に使えるように)。',
    '',
    '# 利用可能なアプリのドキュメント',
    appContext,
    historyText ? `\n# これまでの会話\n${historyText}` : '',
    '',
    `# ユーザーの質問\n${question}`,
  ].join('\n')

  const model = getGemini()
  const result = await model.generateContent(prompt)
  const answer = result.response.text()

  // 使用量を記録(失敗してもチャット応答は返す)
  try {
    const usage = (result.response as any).usageMetadata
    await recordGeminiUsage(usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0)
  } catch {
    // noop
  }

  return { answer }
})
