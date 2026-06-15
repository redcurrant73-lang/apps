// (superuser)ユーザーに業種(クイズ)を割り当てる。空/null で未割り当てに戻す。
import { isValidQuizId } from '~/server/utils/exam-prep/config'
import { setUserQuiz } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const body = await readBody(event)
  const uid = String(body?.uid ?? '')
  const raw = body?.quizId
  if (!uid) throw createError({ statusCode: 400, message: 'uid が必要です' })

  let quizId: string | null = null
  if (raw && String(raw).trim()) {
    quizId = String(raw)
    if (!isValidQuizId(quizId)) throw createError({ statusCode: 400, message: '不明なクイズです' })
  }
  await setUserQuiz(uid, quizId)
  return { ok: true, uid, quizId }
})
