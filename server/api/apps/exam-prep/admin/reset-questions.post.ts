// (superuser)ある業種(クイズ)の問題を全部消して作り直せるようにする。
// 指定なしは自分が今見ている業種。次の出題から新しく生成される。
import { getQuiz } from '~/server/utils/exam-prep/config'
import { getProfile, wipeQuestionsForQuiz } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event).catch(() => ({}))
  const profile = await getProfile(decoded.uid)
  const quizId = body?.quizId ? String(body.quizId) : getQuiz(profile?.quizId).id

  const deleted = await wipeQuestionsForQuiz(quizId)
  return { ok: true, quizId, deleted }
})
