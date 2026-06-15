// AI 出題(必ずバッチ生成)+ 記述式の AI 採点。
// 1問ずつ Gemini を呼ぶと10問で時間切れ→「ボタン押しても始まらない」事故になるので、
// 1回の呼び出しで N 問まとめて JSON 配列で返させる。
import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'
import type { GenreTarget } from './config'

export interface GeneratedQuestion {
  category: string
  difficulty: string
  type: 'choice' | 'free'
  question: string
  options: string[]
  answer: string
  keywords: string[]
  explanation: string
}

/**
 * targets と同じ順番・同じ件数の問題を返すよう依頼する。
 * 末尾 freeCount 問は記述式(用語を答える短答)にする。
 * バリデーションを通った要素だけを、依頼順のまま返す。
 */
export async function generateQuestionsBatch(opts: {
  aiSubject: string
  segmentLabel: string
  targets: GenreTarget[]
  freeCount?: number
}): Promise<GeneratedQuestion[]> {
  const { aiSubject, segmentLabel, targets } = opts
  if (targets.length === 0) return []
  const freeCount = Math.max(0, Math.min(opts.freeCount ?? 0, targets.length))
  const choiceCount = targets.length - freeCount

  const list = targets
    .map((t, i) => {
      const kind = i >= choiceCount ? '(記述・用語)' : '(四肢択一)'
      return `${i + 1}. ${kind} 分野グループ「${t.groupTitle}」/ ジャンル「${t.genre}」`
    })
    .join('\n')

  const prompt = [
    `受検種別: ${segmentLabel}`,
    `あなたは「${aiSubject}」の出題者です。`,
    `次の ${targets.length} 件について、それぞれ別個の問題を1問ずつ、リストと同じ順番で作成してください。`,
    '',
    '【出題リスト】',
    list,
    '',
    '【ルール】',
    `- ${segmentLabel} の業務に直結する論点に絞る。関係ない領域の細かい数値や専門外の手法は出さない。`,
    '- 各問は実際の試験レベル。状況設定・問われ方を問ごとに変え、ありがちな誤解を選択肢に混ぜる。',
    '- 「(四肢択一)」の問題: options は必ず4つ、日本語。answer は options の中の文字列と完全一致。',
    '- 「(記述・用語)」の問題: 短い用語1つを答えさせる。options は空配列 []。answer は正解の用語。keywords に言い換え・同義語を入れる。',
    '- explanation は3〜5文。なぜ正解か、要点を簡潔に。',
    `- explanation の末尾に必ず「【${segmentLabel}の現場で】」で始まる実務上の注意を1文加える。`,
    '- difficulty は "易" "標準" "難" のいずれか。',
    '',
    '【出力】JSON配列のみを返す。前後に説明文やコードフェンス(```)を付けない。',
    '配列の要素は出題リストと同じ順番・同じ件数。各要素は次の形:',
    '{"category":"分野名","difficulty":"標準","type":"choice","question":"問題文","options":["A","B","C","D"],"answer":"A","keywords":["語1"],"explanation":"解説"}',
    '記述の要素は "type":"free","options":[] とする。',
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
    const isFree = q.type === 'free'
    const answer = String(q.answer ?? '')
    if (!answer) continue
    if (isFree) {
      valid.push({
        category: String(q.category ?? ''),
        difficulty: String(q.difficulty ?? '標準'),
        type: 'free',
        question: String(q.question),
        options: [],
        answer,
        keywords: Array.isArray(q.keywords) ? q.keywords.map((k: any) => String(k)) : [],
        explanation: String(q.explanation ?? ''),
      })
    } else {
      const options = Array.isArray(q.options)
        ? q.options.map((o: any) => String(o)).filter(Boolean)
        : []
      if (options.length !== 4 || !options.includes(answer)) continue
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
  }
  return valid
}

export interface GradeResult {
  correct: boolean
  reason: string
}

/** 記述式(free)の AI 採点。表記ゆれ・言い換え・同義語は正解扱い。 */
export async function gradeAnswerByAI(opts: {
  aiSubject: string
  question: string
  answer: string
  synonyms?: string[]
  userAnswer: string
}): Promise<GradeResult> {
  const norm = (s: string) => s.trim().replace(/\s+/g, '').toLowerCase()
  // 空欄は採点を呼ぶまでもなく不正解
  if (!opts.userAnswer.trim()) return { correct: false, reason: '回答が入力されていません' }

  const prompt = [
    `あなたは「${opts.aiSubject}」の採点者です。`,
    '次のユーザー回答が、正解と意味的に同じかどうかを判定してください。',
    '表記ゆれ・言い換え・同義語・送り仮名違いは正解として扱います。明らかに違うものは不正解。',
    '',
    `問題: ${opts.question}`,
    `正解: ${opts.answer}`,
    opts.synonyms && opts.synonyms.length ? `同義語: ${opts.synonyms.join(' / ')}` : '',
    `ユーザー回答: ${opts.userAnswer}`,
    '',
    '【出力】JSONのみ。前後に説明やコードフェンスを付けない: {"correct": true, "reason": "1文の理由"}',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const r = await getGemini().chat({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    await recordGeminiUsage(
      r.response.usageMetadata?.promptTokenCount,
      r.response.usageMetadata?.candidatesTokenCount,
    ).catch(() => {})
    const cleaned = r.response
      .text()
      .replace(/```(?:json)?\n?|\n?```/g, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    return { correct: !!parsed.correct, reason: String(parsed.reason ?? '') }
  } catch {
    // フォールバック:正規化一致 or 同義語一致
    const hit =
      norm(opts.userAnswer) === norm(opts.answer) ||
      (opts.synonyms || []).some((s) => norm(s) === norm(opts.userAnswer))
    return { correct: hit, reason: hit ? '正解と一致しました' : '正解と異なります' }
  }
}
