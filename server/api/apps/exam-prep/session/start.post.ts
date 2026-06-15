// startSession: サクッと開始するため「最初の数問だけ」用意してすぐ返し、残りは pending に。
//   1. 割り当てクイズのトピックを弱点・未出題優先で10個選定
//   2. プール(現行 promptVersion・未正解)で埋める
//   3. 足りない分のうち先頭だけ同期生成して即開始、残りは pending(クライアントが topup で後追い生成)
//   4. 進行中セッションがあれば再開
// answer/explanation はレスポンスに含めない(カンニング防止)。
import { getQuiz } from '~/server/utils/exam-prep/config'
import {
  ensureProfile,
  readCorrectProgress,
  saveSession,
  presentSession,
  type SessionState,
  type SessionQuestion,
} from '~/server/utils/exam-prep/store'
import { pickTargets, splitPoolFill, generateAndStore } from '~/server/utils/exam-prep/engine'

const SESSION_SIZE = 10
const FIRST_BATCH = 4 // すぐ始められるよう、まずこの数だけ用意して開始(残りは topup)

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await ensureProfile(decoded)
  const quiz = getQuiz(profile.quizId)
  const body = await readBody(event).catch(() => ({}))
  const focusCategoryId: string | null = body?.categoryId ? String(body.categoryId) : null

  // 進行中セッションがあれば再開(pending が残っていてもOK)
  const cur = profile.currentSession
  if (cur && (cur.queue.length > 0 || (cur.pending?.length ?? 0) > 0)) {
    return { resumed: true, questions: cur.questions, session: presentSession(cur) }
  }

  const correctList = await readCorrectProgress(decoded.uid)
  const correctIds = new Set(correctList.map((p) => p.questionId))
  const targets = pickTargets(quiz, correctList, SESSION_SIZE, focusCategoryId)
  if (targets.length === 0) {
    throw createError({ statusCode: 500, message: '出題範囲が見つかりません' })
  }

  // プールで埋める → 足りない target
  const { questions: pooled, missing } = await splitPoolFill(quiz, targets, correctIds)

  // すぐ始めるための最初のバッチだけ同期生成、残りは pending
  const needFirst = Math.max(0, FIRST_BATCH - pooled.length)
  const firstTargets = missing.slice(0, needFirst)
  const pending = missing.slice(firstTargets.length)
  const firstFree = Math.min(1, Math.floor(firstTargets.length / 4))

  let firstGen: SessionQuestion[] = []
  if (firstTargets.length) {
    try {
      firstGen = await generateAndStore(quiz, firstTargets, firstFree)
    } catch {
      firstGen = []
    }
  }

  const questions: SessionQuestion[] = [...pooled, ...firstGen]
  // プールも最初の生成も空なら、pending から最低1問だけ同期生成して必ず開始できるようにする
  if (questions.length === 0 && pending.length > 0) {
    try {
      const one = await generateAndStore(quiz, [pending[0]], 0)
      if (one.length) {
        questions.push(...one)
        pending.shift()
      }
    } catch {
      // noop
    }
  }
  if (questions.length === 0) {
    throw createError({
      statusCode: 503,
      message: '問題を用意できませんでした。少し待ってもう一度お試しください。',
    })
  }

  const session: SessionState = {
    startedAt: Date.now(),
    queue: questions.map((q) => q.questionId),
    correct: [],
    attempts: {},
    totalAttempts: 0,
    questions,
    pending,
  }
  await saveSession(decoded.uid, session)

  return { resumed: false, questions, session: presentSession(session) }
})
