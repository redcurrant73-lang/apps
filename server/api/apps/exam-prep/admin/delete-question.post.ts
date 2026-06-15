// (superuser)出題中の1問をプールから削除し、進行中セッションからも外して次へ進める。
import { deleteQuestion, presentSession } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireSuperuser(event)
  const body = await readBody(event)
  const questionId = String(body?.questionId || '')
  if (!questionId) throw createError({ statusCode: 400, message: 'questionId が必要です' })

  const session = await deleteQuestion(decoded.uid, questionId)
  return { ok: true, session: session ? presentSession(session) : null }
})
