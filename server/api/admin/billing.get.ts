// 料金・使用量の概況。superuser / owner のみ。
export default defineEventHandler(async (event) => {
  await requireSuperuser(event)

  const usage = await getUsageSummary()

  let userCount = 0
  let appAccessCount = 0
  try {
    const [u, a] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('appAccess').count().get(),
    ])
    userCount = u.data().count
    appAccessCount = a.data().count
  } catch {
    // count() が使えない場合は無視
  }

  return {
    usage,
    stats: {
      users: userCount,
      appGrants: appAccessCount,
    },
  }
})
