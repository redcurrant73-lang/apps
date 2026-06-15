// topup: 進行中セッションの pending(後追い分)を生成してセッションに追加する。
// クライアントが開始直後に背景で呼ぶ → ユーザーが最初の数問を解く間に残りが揃う。
import { getQuiz } from '~/server/utils/exam-prep/config'
import {
  getProfile,
  appendSessionQuestions,
  presentSession,
  type SessionQuestion,
} from '~/server/utils/exam-prep/store'
import { generateAndStore } from '~/server/utils/exam-prep/engine'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await getProfile(decoded.uid)
  const session = profile?.currentSession
  if (!session) {
    throw createError({ statusCode: 400, message: 'セッションがありません' })
  }
  const pending = session.pending ?? []
  if (pending.length === 0) {
    return { session: presentSession(session) }
  }

  const quiz = getQuiz(profile!.quizId)
  const freeCount = Math.min(2, Math.floor(pending.length / 4))
  let generated: SessionQuestion[] = []
  try {
    generated = await generateAndStore(quiz, pending, freeCount)
  } catch {
    generated = []
  }
  // appendSessionQuestions は生成数に関わらず pending をクリアする(stuck 防止)
  const updated = await appendSessionQuestions(decoded.uid, generated)
  return { session: presentSession(updated ?? session) }
})
