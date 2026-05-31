// 自分がアクセスできるミニアプリの一覧 + 自分のロール。ランチャーが使う。
export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const role = await getUserRole(decoded.uid)
  const apps = await listAccessibleApps(decoded.uid)
  return {
    role: role ?? 'user',
    apps: apps.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      icon: a.icon,
      category: a.category ?? null,
      audience: a.audience,
      path: a.path,
      order: a.order,
    })),
  }
})
