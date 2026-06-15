// startSession: 10問を選ぶ。
//   1. ユーザーの種別/受験パターンに合うジャンルだけに厳密に絞る(範囲外は絶対に混ぜない)
//   2. 既存プールを優先。足りない分だけ AI バッチ生成(1回の呼び出し)
//   3. 進行中セッションがあれば再開
// answer / explanation はレスポンスに含めない(カンニング防止)。
import {
  DOMAIN_CONFIG,
  examLevelForTarget,
  genreTargets,
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

function sample<T>(arr: T[], n: number): T[] {
  const pool = shuffleInPlace([...arr])
  if (pool.length >= n) return pool.slice(0, n)
  // ジャンル数が n より少ない時だけ、重複を許して埋める
  const out = [...pool]
  while (out.length < n) out.push(arr[Math.floor(Math.random() * arr.length)])
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

  if (!profile.segment) {
    throw createError({ statusCode: 400, message: 'はじめに受検種別を選んでください' })
  }
  const examLevel =
    examLevelForTarget(profile.examTarget) || DOMAIN_CONFIG.examTargetOptions[0]?.examLevel
  if (!examLevel) {
    throw createError({ statusCode: 400, message: '受験パターンが未設定です' })
  }

  // 進行中セッションがあれば再開(離脱しても続きから)
  if (profile.currentSession && profile.currentSession.queue.length > 0) {
    return {
      resumed: true,
      questions: profile.currentSession.questions,
      session: presentSession(profile.currentSession),
    }
  }

  const targets = genreTargets(profile.segment, examLevel)
  if (targets.length === 0) {
    throw createError({ statusCode: 500, message: '出題範囲が見つかりません' })
  }
  const picked = sample(targets, SESSION_SIZE)

  // 既に正解済みの問題は再利用しない
  const correctIds = new Set((await readCorrectProgress(decoded.uid)).map((p) => p.questionId))

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

  // 足りない分を 1 回の AI 呼び出しでまとめて生成 → プールに保存 → セッションに採用
  if (missing.length > 0) {
    const generated = await generateQuestionsBatch({
      aiSubject: DOMAIN_CONFIG.aiSubject,
      segmentLabel: profile.segment,
      targets: missing.map((m) => m.target),
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
        type: 'choice',
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
