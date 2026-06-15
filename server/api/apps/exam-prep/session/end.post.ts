// endSession: 今回の成績でレベルを ±1 し、セッションをクリアする。
// 10問を一意正解するのに要した総回答数で判定(ミスが少ないほどレベルが上がる)。
import { getProfile, finishSession } from '~/server/utils/exam-prep/store'

const MAX_LEVEL = 20

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const profile = await getProfile(decoded.uid)
  const session = profile?.currentSession
  if (!session) {
    throw createError({ statusCode: 400, message: '終了できるセッションがありません' })
  }

  const total = session.questions.length || 10
  const attempts = session.totalAttempts || total
  const completed = session.queue.length === 0

  let delta = 0
  if (completed) {
    if (attempts <= total + 1)
      delta = 1 // ほぼノーミス
    else if (attempts >= total * 2) delta = -1 // 苦戦
  }

  const oldLevel = profile!.level
  const newLevel = Math.max(1, Math.min(MAX_LEVEL, oldLevel + delta))
  await finishSession(decoded.uid, newLevel)

  // 正答率(一意正解 ÷ 総回答)
  const accuracy = attempts > 0 ? Math.round((total / attempts) * 100) : 0
  // リトライ回数(やり直しの総数)
  const retries = Math.max(0, attempts - total)

  return { oldLevel, newLevel, delta, total, attempts, retries, accuracy, completed }
})
