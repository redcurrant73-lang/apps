// ユーザー一覧(管理コンソール用)。superuser / owner のみ。
export default defineEventHandler(async (event) => {
  await requireSuperuser(event)
  const snap = await db.collection('users').get()
  const users = snap.docs
    .map((d) => serializeDoc(d.id, d.data()))
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  return { users }
})
