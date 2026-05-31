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
  <div class="flex min-h-dvh flex-col items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">
      <div
        class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-white shadow-lift"
      >
        <Icon name="apps" size="36" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-ink-900">apps</h1>
      <p class="mt-2 text-sm text-ink-600">あなた専用のミニアプリをまとめた場所です</p>

      <div class="mt-8 card text-left">
        <button
          class="btn-primary w-full justify-center py-3"
          :disabled="loading || !configured"
          @click="onLogin"
        >
          <Icon v-if="!loading" name="login" size="20" />
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
