// Web Push 送信。superuser / owner のみ(または Cloud Scheduler から内部的に)。
// body: { uid?: string, title?: string, body?: string, url?: string }
//  - uid 指定あり: そのユーザーの全端末へ
//  - uid 指定なし: 全購読へ(ブロードキャスト)
import webpush from 'web-push'

export default defineEventHandler(async (event) => {
  await requireSuperuser(event)

  const config = useRuntimeConfig()
  if (!config.vapidPublic || !config.vapidPrivate) {
    throw createError({ statusCode: 503, message: '通知機能が未設定です(VAPID鍵)' })
  }
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate)

  const body = await readBody(event)
  const targetUid = body?.uid ? String(body.uid) : null
  const payload = JSON.stringify({
    title: String(body?.title ?? 'お知らせ'),
    body: String(body?.body ?? ''),
    url: String(body?.url ?? '/'),
  })

  const snap = targetUid
    ? await db.collection('pushSubs').where('uid', '==', targetUid).get()
    : await db.collection('pushSubs').get()

  let sent = 0
  let failed = 0
  const stale: FirebaseFirestore.DocumentReference[] = []

  await Promise.all(
    snap.docs.map(async (d) => {
      const s = d.data()
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          payload,
        )
        sent++
      } catch (e: any) {
        failed++
        // 端末が無効(404/410)になっていたら購読を掃除する
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          stale.push(d.ref)
        }
      }
    }),
  )

  if (stale.length) {
    const batch = db.batch()
    stale.forEach((ref) => batch.delete(ref))
    await batch.commit()
  }

  return { sent, failed, cleaned: stale.length }
})
