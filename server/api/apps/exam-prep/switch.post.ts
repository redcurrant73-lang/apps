// 学習中の学習内容を切り替える。自分が使える(role を持つ)もの、または superuser のみ。
// 切り替えると進行中セッションはクリア(別内容に持ち越さない)。レベルは保持。
import { isValidQuizId } from '~/server/utils/exam-prep/config'
import { getProfile, setCurrentQuiz } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  const body = await readBody(event)
  const quizId = String(body?.quizId ?? '')
  if (!quizId || !isValidQuizId(quizId)) {
    throw createError({ statusCode: 400, message: '不明な学習内容です' })
  }
  const isSuper = (await getUserRole(decoded.uid)) === 'superuser'
  const profile = await getProfile(decoded.uid)
  const allowed = isSuper || (profile?.roles ?? []).includes(quizId)
  if (!allowed) {
    throw createError({ statusCode: 403, message: 'その学習内容へのアクセス権がありません' })
  }
  await setCurrentQuiz(decoded.uid, quizId)
  return { ok: true, quizId }
})
