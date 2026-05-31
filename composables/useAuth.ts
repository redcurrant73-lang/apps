// ログイン状態と操作。状態は firebase.client プラグインが useState に書き込む。
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import type { SessionProfile } from '~/plugins/firebase.client'

export const useAuth = () => {
  const { $firebaseAuth } = useNuxtApp() as any

  const user = useState<{ uid: string; email: string | null; displayName: string | null; photoURL: string | null } | null>(
    'auth_user',
    () => null,
  )
  const profile = useState<SessionProfile | null>('auth_profile', () => null)
  const ready = useState<boolean>('auth_ready', () => false)

  const configured = computed(() => !!$firebaseAuth)
  const isLoggedIn = computed(() => !!user.value)
  const isSuperuser = computed(
    () => profile.value?.role === 'superuser' || profile.value?.role === 'owner',
  )

  const login = async () => {
    if (!$firebaseAuth) {
      throw createError({ statusCode: 503, statusMessage: 'ログイン機能がまだ設定されていません' })
    }
    const provider = new GoogleAuthProvider()
    await signInWithPopup($firebaseAuth, provider)
  }

  const logout = async () => {
    if ($firebaseAuth) await signOut($firebaseAuth)
    await navigateTo('/login')
  }

  return { user, profile, ready, configured, isLoggedIn, isSuperuser, login, logout }
}
