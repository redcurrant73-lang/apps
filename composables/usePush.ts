// Web Push 購読。サービスワーカー(@vite-pwa/nuxt)登録済みの前提で動く。
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr
}

export const usePush = () => {
  const { $api } = useNuxtApp() as any
  const config = useRuntimeConfig()

  const isSupported = () =>
    import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  const permission = () => (import.meta.client && 'Notification' in window ? Notification.permission : 'default')

  const subscribe = async () => {
    if (!isSupported()) {
      throw new Error('この端末は通知に対応していません(iPhoneはホーム画面に追加が必要です)')
    }
    const vapid = config.public.vapidPublic
    if (!vapid) throw new Error('通知機能がまだ設定されていません')

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') throw new Error('通知が許可されませんでした')

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      }))

    await $api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() })
    return true
  }

  return { isSupported, permission, subscribe }
}
