// 確認済みのスターター問題を pool に投入する(superuser のみ)。
// 何度押しても seedKey で重複は防がれる。
import { addSeedQuestions } from '~/server/utils/exam-prep/store'
import { SEED_QUESTIONS } from '~/server/utils/exam-prep/seed'

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const added = await addSeedQuestions(SEED_QUESTIONS)
  return { ok: true, added, total: SEED_QUESTIONS.length }
})
