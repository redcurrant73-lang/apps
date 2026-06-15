// startSession: 10問を選ぶ。
//   1. 割り当てクイズのカテゴリ×トピックから出題(範囲外は混ぜない)
//   2. 弱点カテゴリ(達成率が低い)を重み付けして多めに。categoryId 指定で集中セッション
//   3. 既存プール(現行 promptVersion のみ)を優先。足りない分だけ AI バッチ生成
//   4. 進行中セッションがあれば再開
// answer/explanation はレスポンスに含めない(カンニング防止)。
import { getQuiz, quizTargets, categoryGoal, type QuizTarget } from '~/server/utils/exam-prep/config'
import {
  ensureProfile,
  readPool,
  readCorrectProgress,
  addQuestions,
  saveSession,
  presentSession,
  type SessionQuestion,
  type SessionState,
  type PoolQuestion,
} from '~/server/utils/exam-prep/store'
import { generateQuestionsBatch } from '~/server/utils/exam-prep/ai'

const SESSION_SIZE = 10

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function sampleUniform<T>(arr: T[], n: number): T[] {
  const pool = shuffleInPlace([...arr])
  if (pool.length >= n) return pool.slice(0, n)
  const out = [...pool]
  while (out.length < n) out.push(arr[Math.floor(Math.random() * arr.length)])
  return out
}

function weightedSampleDistinct<T>(items: T[], weight: (t: T) => number, n: number): T[] {
  const pool = items.map((it) => ({ it, w: Math.max(0.01, weight(it)) }))
  const out: T[] = []
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.w, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w
      if (r <= 0) break
    }
    if (idx >= pool.length) idx = pool.length - 1
    out.push(pool[idx].it)
    pool.splice(idx, 1)
  }
  while (out.length < n && items.length > 0) out.push(items[Math.floor(Math.random() * items.length)])
  return out
}

function toSessionQuestion(q: PoolQuestion, t: QuizTarget): SessionQuestion {
  return {
    questionId: q.id,
    categoryId: t.categoryId,
    categoryTitle: t.categoryTitle,
    topic: t.topic,
    type: q.type,
    question: q.question,
    options: q.options,
  }
}

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await ensureProfile(decoded)
  const quiz = getQuiz(profile.quizId)
  const body = await readBody(event).catch(() => ({}))
  const focusCategoryId: string | null = body?.categoryId ? String(body.categoryId) : null

  // 進行中セッションがあれば再開
  if (profile.currentSession && profile.currentSession.queue.length > 0) {
    return {
      resumed: true,
      questions: profile.currentSession.questions,
      session: presentSession(profile.currentSession),
    }
  }

  const allTargets = quizTargets(quiz)
  if (allTargets.length === 0) {
    throw createError({ statusCode: 500, message: '出題範囲が見つかりません' })
  }

  // 既正解の除外 + カテゴリ別達成度(弱点優先の重み)
  const correctList = await readCorrectProgress(decoded.uid)
  const correctIds = new Set(correctList.map((p) => p.questionId))
  const perCat = new Map<string, Set<string>>()
  for (const p of correctList) {
    if (!perCat.has(p.categoryId)) perCat.set(p.categoryId, new Set())
    perCat.get(p.categoryId)!.add(p.questionId)
  }
  const catWeight = (catId: string) => {
    const mastery = Math.min(1, (perCat.get(catId)?.size ?? 0) / categoryGoal(quiz, catId))
    return 1 + (1 - mastery) * 2
  }

  let picked: QuizTarget[]
  if (focusCategoryId) {
    const focus = allTargets.filter((t) => t.categoryId === focusCategoryId)
    if (focus.length === 0) throw createError({ statusCode: 400, message: 'そのカテゴリは対象外です' })
    picked = sampleUniform(focus, SESSION_SIZE)
  } else {
    picked = weightedSampleDistinct(allTargets, (t) => catWeight(t.categoryId), SESSION_SIZE)
  }

  // プール(現行 promptVersion・未正解)を topic 別に整理
  const pool = (await readPool(quiz.id, quiz.prompt.version)).filter((q) => !correctIds.has(q.id))
  const byTopic = new Map<string, PoolQuestion[]>()
  for (const q of pool) {
    const k = `${q.categoryId}::${q.topic}`
    if (!byTopic.has(k)) byTopic.set(k, [])
    byTopic.get(k)!.push(q)
  }
  for (const list of byTopic.values()) shuffleInPlace(list)

  const chosen: (SessionQuestion | undefined)[] = new Array(picked.length)
  const usedIds = new Set<string>()
  const missing: { idx: number; target: QuizTarget }[] = []

  picked.forEach((target, idx) => {
    const found = (byTopic.get(`${target.categoryId}::${target.topic}`) || []).find(
      (q) => !usedIds.has(q.id),
    )
    if (found) {
      usedIds.add(found.id)
      chosen[idx] = toSessionQuestion(found, target)
    } else {
      missing.push({ idx, target })
    }
  })

  if (missing.length > 0) {
    const freeCount = Math.min(2, Math.floor(missing.length / 5))
    const generated = await generateQuestionsBatch({
      quiz,
      targets: missing.map((m) => m.target),
      freeCount,
    })
    const toAdd: Omit<PoolQuestion, 'id'>[] = []
    const slots: number[] = []
    const slotTargets: QuizTarget[] = []
    for (let i = 0; i < missing.length && i < generated.length; i++) {
      const m = missing[i]
      const g = generated[i]
      toAdd.push({
        category: g.category || m.target.categoryTitle,
        difficulty: g.difficulty,
        type: g.type,
        question: g.question,
        options: g.options,
        answer: g.answer,
        keywords: g.keywords,
        explanation: g.explanation,
        quizId: quiz.id,
        categoryId: m.target.categoryId,
        topic: m.target.topic,
        promptVersion: quiz.prompt.version,
        source: 'generated',
      })
      slots.push(m.idx)
      slotTargets.push(m.target)
    }
    const added = await addQuestions(toAdd)
    added.forEach((q, i) => {
      chosen[slots[i]] = toSessionQuestion(q, slotTargets[i])
    })
  }

  const finalQuestions = chosen.filter((q): q is SessionQuestion => !!q)
  if (finalQuestions.length === 0) {
    throw createError({
      statusCode: 503,
      message: '問題を用意できませんでした。少し待ってもう一度お試しください。',
    })
  }

  const session: SessionState = {
    startedAt: Date.now(),
    queue: finalQuestions.map((q) => q.questionId),
    correct: [],
    attempts: {},
    totalAttempts: 0,
    questions: finalQuestions,
  }
  await saveSession(decoded.uid, session)

  return { resumed: false, questions: finalQuestions, session: presentSession(session) }
})
