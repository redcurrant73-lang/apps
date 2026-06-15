// (superuser)ユーザーに使える学習内容(role = 複数可)を割り当てる。
// roles から外れたら現在の学習内容を付け替え、その場合は進行中セッションをクリア。
import { isValidQuizId } from '~/server/utils/exam-prep/config'
import { getProfile, setUserRoles } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const body = await readBody(event)
  const uid = String(body?.uid ?? '')
  if (!uid) throw createError({ statusCode: 400, message: 'uid が必要です' })

  const roles = Array.isArray(body?.roles)
    ? [...new Set(body.roles.map((r: any) => String(r)).filter((r: string) => isValidQuizId(r)))]
    : []

  const target = await getProfile(uid)
  const cur = target?.currentQuizId ?? null
  const newCurrent = cur && roles.includes(cur) ? cur : (roles[0] ?? null)
  await setUserRoles(uid, roles, newCurrent, newCurrent !== cur)

  return { ok: true, uid, roles }
})
