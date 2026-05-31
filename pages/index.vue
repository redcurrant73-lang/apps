<script setup lang="ts">
const { ready, user, profile, isSuperuser } = useAuth()
const { apps, pending, error, load } = useApps()
const { isSupported, permission, subscribe } = usePush()

const pushBusy = ref(false)
const pushMsg = ref('')

watch(
  [ready, user],
  () => {
    if (!ready.value) return
    if (!user.value) {
      navigateTo('/login')
    } else {
      load()
    }
  },
  { immediate: true },
)

const enablePush = async () => {
  pushBusy.value = true
  pushMsg.value = ''
  try {
    await subscribe()
    pushMsg.value = '通知をオンにしました'
  } catch (e: any) {
    pushMsg.value = e?.message || '通知をオンにできませんでした'
  } finally {
    pushBusy.value = false
  }
}
</script>

<template>
  <div>
    <AppHeader />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <div v-if="!ready || (pending && apps.length === 0)" class="py-20 text-center text-slate-400">
        読み込み中…
      </div>

      <template v-else>
        <div class="mb-5">
          <h2 class="text-xl font-bold text-slate-900">
            こんにちは{{ profile?.displayName ? `、${profile.displayName}さん` : '' }}
          </h2>
          <p class="text-sm text-slate-500">使えるアプリ一覧です</p>
        </div>

        <p v-if="error" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
          {{ error }}
        </p>

        <div v-if="apps.length === 0 && !error" class="card text-center text-slate-500">
          まだ使えるアプリがありません。
        </div>

        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NuxtLink
            v-for="app in apps"
            :key="app.id"
            :to="app.path"
            class="card flex flex-col items-center gap-2 py-6 text-center transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span class="text-4xl">{{ app.icon }}</span>
            <span class="text-sm font-medium text-slate-800">{{ app.title }}</span>
          </NuxtLink>
        </div>

        <div v-if="isSupported() && permission() !== 'granted'" class="mt-8 card">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-slate-800">通知を受け取る</p>
              <p class="text-xs text-slate-500">
                iPhoneは「ホーム画面に追加」してから設定してください
              </p>
            </div>
            <button class="btn-ghost shrink-0" :disabled="pushBusy" @click="enablePush">
              {{ pushBusy ? '設定中…' : 'オンにする' }}
            </button>
          </div>
          <p v-if="pushMsg" class="mt-2 text-xs text-slate-500">{{ pushMsg }}</p>
        </div>

        <NuxtLink
          v-if="isSuperuser"
          to="/apps/settings"
          class="mt-6 block text-center text-sm text-slate-400 hover:text-slate-600"
        >
          設定・管理 →
        </NuxtLink>
      </template>
    </main>
  </div>
</template>
