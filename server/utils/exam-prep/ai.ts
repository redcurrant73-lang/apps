// AI 出題(必ずバッチ生成)+ 記述式の AI 採点。
// プロンプトは「共通の土台」+「クイズごとの固有プロンプト(quiz.prompt.persona / rules)」。
// 出題の質を調整したいときは config.ts の該当クイズの prompt.rules を編集 → prompt.version を上げる。
import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'
import type { QuizTarget, Quiz } from './config'

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

export async function generateQuestionsBatch(opts: {
  quiz: Quiz
  targets: QuizTarget[]
  freeCount?: number
}): Promise<GeneratedQuestion[]> {
  const { quiz, targets } = opts
  if (targets.length === 0) return []
  const freeCount = Math.max(0, Math.min(opts.freeCount ?? 0, targets.length))
  const choiceCount = targets.length - freeCount

  const list = targets
    .map((t, i) => {
      const kind = i >= choiceCount ? '(記述・用語)' : '(四肢択一)'
      return `${i + 1}. ${kind} カテゴリ「${t.categoryTitle}」/ トピック「${t.topic}」`
    })
    .join('\n')

  const prompt = [
    // ---- クイズ固有 ----
    quiz.prompt.persona,
    `対象は「${quiz.occupation}」です。次の ${targets.length} 件について、それぞれ別個の問題を1問ずつ、リストと同じ順番で作成してください。`,
    '',
    '【出題リスト】',
    list,
    '',
    '【この分野の作問ルール】',
    ...quiz.prompt.rules.map((r) => `- ${r}`),
    '',
    '【共通ルール】',
    '- 各問は状況設定・問われ方を変え、ありがちな誤解を選択肢に混ぜる。',
    '- 「(四肢択一)」: options は必ず4つ、日本語。answer は options の文字列と完全一致。',
    '- 「(記述・用語)」: 短い用語1つを答えさせる。options は空配列 []。answer は正解の用語、keywords に言い換え・同義語。',
    '- explanation は3〜5文。なぜ正解か、要点を簡潔に。',
    '- explanation の末尾に必ず「【現場で】」で始まる実務上の注意を1文加える。',
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
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : []

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
      const options = Array.isArray(q.options) ? q.options.map((o: any) => String(o)).filter(Boolean) : []
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
    const hit =
      norm(opts.userAnswer) === norm(opts.answer) ||
      (opts.synonyms || []).some((s) => norm(s) === norm(opts.userAnswer))
    return { correct: hit, reason: hit ? '正解と一致しました' : '正解と異なります' }
  }
}
