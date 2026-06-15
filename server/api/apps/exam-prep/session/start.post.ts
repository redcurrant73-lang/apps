// startSession: 10問を選ぶ。
//   1. ユーザーの種別/受験パターンに合うジャンルだけに厳密に絞る(範囲外は絶対に混ぜない)
//   2. 弱点(達成率の低い分野)を優先的に多めにサンプリング。groupId 指定で集中セッション
//   3. 既存プールを優先。足りない分だけ AI バッチ生成(1回の呼び出し、一部は記述式)
//   4. 進行中セッションがあれば再開
// answer / explanation はレスポンスに含めない(カンニング防止)。
import {
  DOMAIN_CONFIG,
  examLevelForTarget,
  genreTargets,
  relevantGroups,
  groupGoal,
  isCommonGroup,
  type GenreTarget,
} from '~/server/utils/exam-prep/config'
import {
  ensureProfile,
  readPoolByLevel,
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

function toSessionQuestion(q: PoolQuestion, t: GenreTarget): SessionQuestion {
  return {
    questionId: q.id,
    groupId: t.groupId,
    groupTitle: t.groupTitle,
    genre: t.genre,
    type: q.type,
    question: q.question,
    options: q.options,
  }
}

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await ensureProfile(decoded)
  const body = await readBody(event).catch(() => ({}))
  const focusGroupId: string | null = body?.groupId ? String(body.groupId) : null

  if (!profile.segment) {
    throw createError({ statusCode: 400, message: 'はじめに受検種別を選んでください' })
  }
  const examLevel =
    examLevelForTarget(profile.examTarget) || DOMAIN_CONFIG.examTargetOptions[0]?.examLevel
  if (!examLevel) {
    throw createError({ statusCode: 400, message: '受験パターンが未設定です' })
  }

  // 進行中セッションがあれば再開
  if (profile.currentSession && profile.currentSession.queue.length > 0) {
    return {
      resumed: true,
      questions: profile.currentSession.questions,
      session: presentSession(profile.currentSession),
    }
  }

  const allTargets = genreTargets(profile.segment, examLevel)
  if (allTargets.length === 0) {
    throw createError({ statusCode: 500, message: '出題範囲が見つかりません' })
  }

  // 既に正解済みの問題は再利用しない + 分野別の達成度(弱点優先の重みに使う)
  const correctList = await readCorrectProgress(decoded.uid)
  const correctIds = new Set(correctList.map((p) => p.questionId))
  const perGroupCorrect = new Map<string, Set<string>>()
  for (const p of correctList) {
    if (!perGroupCorrect.has(p.groupId)) perGroupCorrect.set(p.groupId, new Set())
    perGroupCorrect.get(p.groupId)!.add(p.questionId)
  }
  const groupWeight = (gid: string) => {
    const mastery = Math.min(1, (perGroupCorrect.get(gid)?.size ?? 0) / groupGoal(gid))
    return 1 + (1 - mastery) * 2 // 未習得ほど重い(1〜3)
  }

  // 出題ジャンルを10個サンプリング
  let picked: GenreTarget[]
  if (focusGroupId) {
    const okGroup = relevantGroups(profile.segment, examLevel).some((g) => g.id === focusGroupId)
    if (!okGroup) throw createError({ statusCode: 400, message: 'その分野は対象外です' })
    const focusTargets = allTargets.filter((t) => t.groupId === focusGroupId)
    if (focusTargets.length === 0) throw createError({ statusCode: 400, message: 'その分野の出題がありません' })
    picked = sampleUniform(focusTargets, SESSION_SIZE)
  } else {
    picked = weightedSampleDistinct(allTargets, (t) => groupWeight(t.groupId), SESSION_SIZE)
  }

  // プール(同じ examLevel・種別一致 or 共通・未正解)を genre 別に整理
  const pool = (await readPoolByLevel(examLevel)).filter(
    (q) => (q.segment === profile.segment || q.segment === '共通') && !correctIds.has(q.id),
  )
  const byGenre = new Map<string, PoolQuestion[]>()
  for (const q of pool) {
    if (!byGenre.has(q.genre)) byGenre.set(q.genre, [])
    byGenre.get(q.genre)!.push(q)
  }
  for (const list of byGenre.values()) shuffleInPlace(list)

  const chosen: (SessionQuestion | undefined)[] = new Array(picked.length)
  const usedIds = new Set<string>()
  const missing: { idx: number; target: GenreTarget }[] = []

  picked.forEach((target, idx) => {
    const found = (byGenre.get(target.genre) || []).find((q) => !usedIds.has(q.id))
    if (found) {
      usedIds.add(found.id)
      chosen[idx] = toSessionQuestion(found, target)
    } else {
      missing.push({ idx, target })
    }
  })

  // 足りない分を 1 回の AI 呼び出しでまとめて生成(末尾は記述式)→ プール保存 → セッション採用
  if (missing.length > 0) {
    const freeCount = Math.min(2, Math.floor(missing.length / 5))
    const generated = await generateQuestionsBatch({
      aiSubject: DOMAIN_CONFIG.aiSubject,
      segmentLabel: profile.segment,
      targets: missing.map((m) => m.target),
      freeCount,
    })
    const toAdd: Omit<PoolQuestion, 'id'>[] = []
    const slots: number[] = []
    const slotTargets: GenreTarget[] = []
    for (let i = 0; i < missing.length && i < generated.length; i++) {
      const m = missing[i]
      const g = generated[i]
      toAdd.push({
        category: g.category || m.target.groupTitle,
        difficulty: g.difficulty,
        type: g.type,
        question: g.question,
        options: g.options,
        answer: g.answer,
        keywords: g.keywords,
        explanation: g.explanation,
        genre: m.target.genre,
        groupId: m.target.groupId,
        examLevel,
        segment: isCommonGroup(m.target.groupId) ? '共通' : profile.segment,
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
