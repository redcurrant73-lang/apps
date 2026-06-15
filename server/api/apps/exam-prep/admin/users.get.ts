// (superuser)全ユーザーの業種(クイズ)割り当て状況 + 選べるクイズ一覧。
import { listQuizzes } from '~/server/utils/exam-prep/config'
import { listAssignments } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const [users, quizzes] = await Promise.all([listAssignments(), Promise.resolve(listQuizzes())])
  return { users, quizzes }
})
