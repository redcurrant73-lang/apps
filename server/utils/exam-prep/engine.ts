// 出題エンジン:出題対象(トピック)の選定 + プール充当 + AI生成。
// start(初回バッチ)と topup(残りを後追い)で共有する。
import type { Quiz, QuizTarget } from './config'
import { quizTargets } from './config'
import { generateQuestionsBatch } from './ai'
import { readPool, addQuestions, type PoolQuestion, type SessionQuestion } from './store'

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function weightedSampleDistinct<T>(items: T[], weight: (t: T) => number, n: number): T[] {
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

/** トピック単位の達成度から重みを作る。未出題(0)を最優先=網羅性。 */
export function buildTopicWeight(correctList: { categoryId: string; topic: string; questionId: string }[]) {
  const perTopic = new Map<string, Set<string>>()
  for (const p of correctList) {
    const k = `${p.categoryId}::${p.topic}`
    if (!perTopic.has(k)) perTopic.set(k, new Set())
    perTopic.get(k)!.add(p.questionId)
  }
  return (t: QuizTarget) => {
    const c = perTopic.get(`${t.categoryId}::${t.topic}`)?.size ?? 0
    return 1 + 3 * (1 - Math.min(1, c / 2))
  }
}

/** 出題トピックを n 個選ぶ(弱点・未出題優先)。focusCategoryId 指定でそのカテゴリ内のみ。 */
export function pickTargets(
  quiz: Quiz,
  correctList: { categoryId: string; topic: string; questionId: string }[],
  n: number,
  focusCategoryId?: string | null,
): QuizTarget[] {
  const all = quizTargets(quiz)
  const pool = focusCategoryId ? all.filter((t) => t.categoryId === focusCategoryId) : all
  if (pool.length === 0) return []
  return weightedSampleDistinct(pool, buildTopicWeight(correctList), n)
}

export function toSessionQuestion(q: PoolQuestion, t: QuizTarget): SessionQuestion {
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

/** targets をプール(現行 promptVersion・未正解)で埋め、見つかった問題と足りない target を返す */
export async function splitPoolFill(
  quiz: Quiz,
  targets: QuizTarget[],
  correctIds: Set<string>,
): Promise<{ questions: SessionQuestion[]; missing: QuizTarget[] }> {
  const pool = (await readPool(quiz.id, quiz.prompt.version)).filter((q) => !correctIds.has(q.id))
  const byTopic = new Map<string, PoolQuestion[]>()
  for (const q of pool) {
    const k = `${q.categoryId}::${q.topic}`
    if (!byTopic.has(k)) byTopic.set(k, [])
    byTopic.get(k)!.push(q)
  }
  for (const list of byTopic.values()) shuffleInPlace(list)

  const used = new Set<string>()
  const questions: SessionQuestion[] = []
  const missing: QuizTarget[] = []
  for (const t of targets) {
    const found = (byTopic.get(`${t.categoryId}::${t.topic}`) || []).find((q) => !used.has(q.id))
    if (found) {
      used.add(found.id)
      questions.push(toSessionQuestion(found, t))
    } else {
      missing.push(t)
    }
  }
  return { questions, missing }
}

/** targets を AI 生成してプール保存し、SessionQuestion[] を返す(生成順=targets順、足りなければ前詰め) */
export async function generateAndStore(quiz: Quiz, targets: QuizTarget[], freeCount = 0): Promise<SessionQuestion[]> {
  if (targets.length === 0) return []
  const generated = await generateQuestionsBatch({ quiz, targets, freeCount })
  const toAdd: Omit<PoolQuestion, 'id'>[] = []
  const pairTargets: QuizTarget[] = []
  for (let i = 0; i < targets.length && i < generated.length; i++) {
    const t = targets[i]
    const g = generated[i]
    toAdd.push({
      category: g.category || t.categoryTitle,
      difficulty: g.difficulty,
      type: g.type,
      question: g.question,
      options: g.options,
      answer: g.answer,
      keywords: g.keywords,
      explanation: g.explanation,
      quizId: quiz.id,
      categoryId: t.categoryId,
      topic: t.topic,
      promptVersion: quiz.prompt.version,
      source: 'generated',
    })
    pairTargets.push(t)
  }
  const added = await addQuestions(toAdd)
  return added.map((q, i) => toSessionQuestion(q, pairTargets[i]))
}
