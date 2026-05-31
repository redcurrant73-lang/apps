// $api: ID Token を自動付与する $fetch ラッパー。
// クライアントでログイン中なら Authorization ヘッダを付ける。
export default defineNuxtPlugin(() => {
  const api = $fetch.create({
    async onRequest({ options }) {
      const { $firebaseAuth } = useNuxtApp() as any
      const current = $firebaseAuth?.currentUser
      if (current) {
        const token = await current.getIdToken()
        const headers = new Headers(options.headers as HeadersInit | undefined)
        headers.set('authorization', `Bearer ${token}`)
        options.headers = headers
      }
    },
  })

  return { provide: { api } }
})
