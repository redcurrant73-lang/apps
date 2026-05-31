<script setup lang="ts">
const { login, configured, ready, user } = useAuth()
const loading = ref(false)
const errorMsg = ref('')

watch(
  [ready, user],
  () => {
    if (ready.value && user.value) navigateTo('/')
  },
  { immediate: true },
)

const onLogin = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    await login()
  } catch (e: any) {
    errorMsg.value = e?.statusMessage || e?.message || 'ログインできませんでした'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">
      <div class="mb-2 text-5xl">📱</div>
      <h1 class="text-2xl font-bold text-slate-900">apps</h1>
      <p class="mt-2 text-sm text-slate-500">あなた専用のミニアプリをまとめた場所です</p>

      <div class="mt-8 card text-left">
        <button
          class="btn-primary w-full justify-center"
          :disabled="loading || !configured"
          @click="onLogin"
        >
          <span v-if="loading">ログイン中…</span>
          <span v-else>Google でログイン</span>
        </button>

        <p v-if="!configured" class="mt-3 text-center text-xs text-amber-600">
          ログイン機能はまだ準備中です(設定が反映されると使えます)
        </p>
        <p v-if="errorMsg" class="mt-3 text-center text-sm text-red-600">{{ errorMsg }}</p>
      </div>
    </div>
  </div>
</template>
