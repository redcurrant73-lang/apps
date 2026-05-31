// 自分がアクセスできるミニアプリ一覧。
export interface LauncherApp {
  id: string
  slug: string
  title: string
  icon: string
  category: string | null
  audience: 'private' | 'shared' | 'public'
  path: string
  order: number
}

export const useApps = () => {
  const { $api } = useNuxtApp() as any

  const apps = useState<LauncherApp[]>('my_apps', () => [])
  const role = useState<string>('my_role', () => 'user')
  const pending = useState<boolean>('my_apps_pending', () => false)
  const error = useState<string | null>('my_apps_error', () => null)

  const load = async () => {
    pending.value = true
    error.value = null
    try {
      const res = await $api('/api/my/access')
      apps.value = res.apps
      role.value = res.role
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || 'アプリ一覧を読み込めませんでした'
      apps.value = []
    } finally {
      pending.value = false
    }
  }

  return { apps, role, pending, error, load }
}
