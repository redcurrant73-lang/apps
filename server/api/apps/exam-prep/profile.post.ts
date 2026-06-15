// setProfile: 本人が変えられるのは表示名とランキング表示だけ。
// 業種(quizId)・level・成績は本人からは変えられない(quizId は superuser が割り当てる)。
import { ensureProfile, updateProfileFields } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  await ensureProfile(decoded)
  const body = await readBody(event)

  const fields: Record<string, any> = {}
  if (typeof body?.displayName === 'string') fields.displayName = body.displayName.trim().slice(0, 40)
  if (typeof body?.visibleToPeers === 'boolean') fields.visibleToPeers = body.visibleToPeers

  if (Object.keys(fields).length === 0) {
    throw createError({ statusCode: 400, message: '更新する項目がありません' })
  }
  await updateProfileFields(decoded.uid, fields)
  return { ok: true }
})
