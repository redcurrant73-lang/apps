// クライアント側の Firebase 初期化 + ログイン状態の監視。
// 公開設定は runtimeConfig.public.firebaseConfig(JSON文字列)から読む。
// 設定が無い環境(ローカル等)では auth=null となり、UI 側で「未設定」を表示する。
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, type Auth } from 'firebase/auth'

export interface SessionProfile {
  uid: string
  email: string
  displayName: string
  photoURL: string
  role: 'owner' | 'superuser' | 'user'
}

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const user = useState<AuthUser | null>('auth_user', () => null)
  const profile = useState<SessionProfile | null>('auth_profile', () => null)
  const ready = useState<boolean>('auth_ready', () => false)

  const raw = config.public.firebaseConfig
  let fb: any = null
  try {
    fb = typeof raw === 'string' && raw ? JSON.parse(raw) : raw || null
  } catch {
    fb = null
  }

  if (!fb?.apiKey) {
    // 未設定: ログインはできないが、アプリ自体は起動する
    ready.value = true
    return { provide: { firebaseAuth: null as Auth | null } }
  }

  const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(fb)
  const auth = getAuth(app)

  onAuthStateChanged(auth, async (u) => {
    user.value = u
      ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL }
      : null
    if (u) {
      try {
        const token = await u.getIdToken()
        profile.value = await $fetch<SessionProfile>('/api/auth/login', {
          headers: { authorization: `Bearer ${token}` },
        })
      } catch {
        profile.value = null
      }
    } else {
      profile.value = null
    }
    ready.value = true
  })

  return { provide: { firebaseAuth: auth } }
})
