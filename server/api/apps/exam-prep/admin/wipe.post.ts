// 問題プールを消す(superuser のみ)。body.source で 'generated' / 'seed' を限定可。
// 指定なしで全消去。1回最大500件(必要なら複数回)。
import { wipeQuestions } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const body = await readBody(event).catch(() => ({}))
  const source =
    body?.source === 'generated' || body?.source === 'seed' ? body.source : undefined
  const deleted = await wipeQuestions(source)
  return { ok: true, deleted }
})
