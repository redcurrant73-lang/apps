// ルート保護(クライアント側)。
// 認証状態は firebase.client プラグインが解決する。状態が確定(ready)するまでは
// 各ページがローディングを出すので、ここでは ready 後の振り分けだけ行う。
const PUBLIC_PATHS = ['/login']

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const ready = useState<boolean>('auth_ready', () => false)
  const user = useState<unknown>('auth_user', () => null)

  if (!ready.value) return

  const isPublic = PUBLIC_PATHS.includes(to.path)
  if (!user.value && !isPublic) {
    return navigateTo('/login')
  }
  if (user.value && to.path === '/login') {
    return navigateTo('/')
  }
})
