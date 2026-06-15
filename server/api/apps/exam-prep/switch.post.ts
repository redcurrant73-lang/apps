// (superuser)自分の課題(クイズ)を切り替える。各業種のUI・出題を確認するため。
// 切り替えると進行中セッションはクリア、レベルはリセット(setUserQuiz)。
import { isValidQuizId } from '~/server/utils/exam-prep/config'
import { setUserQuiz } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)
  const quizId = String(body?.quizId ?? '')
  if (!quizId || !isValidQuizId(quizId)) {
    throw createError({ statusCode: 400, message: '不明なクイズです' })
  }
  await setUserQuiz(decoded.uid, quizId)
  return { ok: true, quizId }
})
