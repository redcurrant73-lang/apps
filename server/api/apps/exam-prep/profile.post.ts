// setProfile: 本人の安全フィールド(種別・受験パターン・表示名・ランキング表示)のみ更新。
// level / totalCorrect / totalAnswers はここでは触らせない(セッション処理だけが更新する)。
import { DOMAIN_CONFIG } from '~/server/utils/exam-prep/config'
import { ensureProfile, updateProfileFields } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  const decoded = await requireAppAccess(event, 'exam-prep')
  await ensureProfile(decoded)
  const body = await readBody(event)

  const fields: Record<string, any> = {}

  if (typeof body?.segment === 'string') {
    if (!DOMAIN_CONFIG.segments.some((s) => s.id === body.segment)) {
      throw createError({ statusCode: 400, message: '不正な種別です' })
    }
    fields.segment = body.segment
  }
  if (typeof body?.examTarget === 'string') {
    if (!DOMAIN_CONFIG.examTargetOptions.some((t) => t.id === body.examTarget)) {
      throw createError({ statusCode: 400, message: '不正な受験パターンです' })
    }
    fields.examTarget = body.examTarget
  }
  if (typeof body?.displayName === 'string') {
    fields.displayName = body.displayName.trim().slice(0, 40)
  }
  if (typeof body?.visibleToPeers === 'boolean') {
    fields.visibleToPeers = body.visibleToPeers
  }

  if (Object.keys(fields).length === 0) {
    throw createError({ statusCode: 400, message: '更新する項目がありません' })
  }

  await updateProfileFields(decoded.uid, fields)
  return { ok: true }
})
