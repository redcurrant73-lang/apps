// AI 出題(必ずバッチ生成)。
// 1問ずつ Gemini を呼ぶと10問で時間切れ→「ボタン押しても始まらない」事故になるので、
// 1回の呼び出しで N 問まとめて JSON 配列で返させる。
import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'
import type { GenreTarget } from './config'

export interface GeneratedQuestion {
  category: string
  difficulty: string
  type: 'choice'
  question: string
  options: string[]
  answer: string
  keywords: string[]
  explanation: string
}

/**
 * targets と同じ順番・同じ件数の問題を返すよう依頼する。
 * バリデーションを通った要素だけを、依頼順のまま返す。
 */
export async function generateQuestionsBatch(opts: {
  aiSubject: string
  segmentLabel: string
  targets: GenreTarget[]
}): Promise<GeneratedQuestion[]> {
  const { aiSubject, segmentLabel, targets } = opts
  if (targets.length === 0) return []

  const list = targets
    .map((t, i) => `${i + 1}. 分野グループ「${t.groupTitle}」/ ジャンル「${t.genre}」`)
    .join('\n')

  const prompt = [
    `受検種別: ${segmentLabel}`,
    `あなたは「${aiSubject}」の出題者です。`,
    `次の ${targets.length} 件について、それぞれ別個の四肢択一問題を1問ずつ、リストと同じ順番で作成してください。`,
    '',
    '【出題リスト】',
    list,
    '',
    '【ルール】',
    `- ${segmentLabel} の業務に直結する論点に絞る。関係ない領域の細かい数値や専門外の手法は出さない。`,
    '- 各問は実際の試験レベル。状況設定・問われ方を問ごとに変え、ありがちな誤解を選択肢に混ぜる。',
    '- options は必ず4つ。日本語。answer は options の中の文字列と完全一致させる。',
    '- explanation は3〜5文。なぜ正解か、他がなぜ誤りかを簡潔に。',
    `- explanation の末尾に必ず「【${segmentLabel}の現場で】」で始まる運用上の注意を1文加える。`,
    '- difficulty は "易" "標準" "難" のいずれか。',
    '',
    '【出力】JSON配列のみを返す。前後に説明文やコードフェンス(```)を付けない。',
    '配列の要素は出題リストと同じ順番・同じ件数。各要素は次の形:',
    '{"category":"分野名","difficulty":"標準","type":"choice","question":"問題文","options":["A","B","C","D"],"answer":"A","keywords":["語1","語2"],"explanation":"解説"}',
  ].join('\n')

  const r = await getGemini().chat({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  })
  const text = r.response.text()
  await recordGeminiUsage(
    r.response.usageMetadata?.promptTokenCount,
    r.response.usageMetadata?.candidatesTokenCount,
  ).catch(() => {})

  let parsed: any
  try {
    const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return []
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
      ? parsed.questions
      : []

  const valid: GeneratedQuestion[] = []
  for (const q of arr) {
    if (!q || typeof q.question !== 'string') continue
    const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o)).filter(Boolean) : []
    const answer = String(q.answer ?? '')
    if (options.length !== 4) continue
    if (!options.includes(answer)) continue
    valid.push({
      category: String(q.category ?? ''),
      difficulty: String(q.difficulty ?? '標準'),
      type: 'choice',
      question: String(q.question),
      options,
      answer,
      keywords: Array.isArray(q.keywords) ? q.keywords.map((k: any) => String(k)) : [],
      explanation: String(q.explanation ?? ''),
    })
  }
  return valid
}
