// アクセス権マトリクス用データ: ユーザー一覧 × アプリ一覧 + 現在の付与状況。
// superuser / owner のみ。
export default defineEventHandler(async (event) => {
  await requireSuperuser(event)

  const [usersSnap, apps, grantsSnap] = await Promise.all([
    db.collection('users').get(),
    loadAllReadmes(),
    db.collection('appAccess').get(),
  ])

  const users = usersSnap.docs
    .map((d) => serializeDoc(d.id, d.data()))
    .filter((u): u is NonNullable<typeof u> => u !== null)

  const grants: Record<string, boolean> = {}
  grantsSnap.forEach((d) => {
    grants[d.id] = true // ドキュメントIDは `${uid}_${appId}`
  })

  return {
    users,
    apps: apps.map((a) => ({
      id: a.id,
      title: a.title,
      icon: a.icon,
      audience: a.audience,
      visibility: a.visibility,
    })),
    grants,
  }
})
