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
        <div class="mb-6">
          <h2 class="text-2xl font-bold tracking-tight text-ink-900">
            こんにちは{{ profile?.displayName ? `、${profile.displayName}さん` : '' }}
          </h2>
          <p class="mt-1 text-sm text-ink-400">使えるアプリ一覧です</p>
        </div>

        <p v-if="error" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
          {{ error }}
        </p>

        <div v-if="apps.length === 0 && !error" class="card text-center text-ink-400">
          まだ使えるアプリがありません。
        </div>

        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NuxtLink
            v-for="app in apps"
            :key="app.id"
            :to="app.path"
            class="card-tap flex flex-col items-center gap-3 py-7 text-center"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
            >
              <Icon :name="app.icon" size="28" />
            </span>
            <span class="text-sm font-semibold text-ink-800">{{ app.title }}</span>
          </NuxtLink>
        </div>

        <div v-if="isSupported() && permission() !== 'granted'" class="mt-8 card">
          <div class="flex items-center gap-4">
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"
            >
              <Icon name="notifications_active" size="22" />
            </span>
            <div class="flex-1">
              <p class="text-sm font-semibold text-ink-800">通知を受け取る</p>
              <p class="text-xs text-ink-400">
                iPhoneは「ホーム画面に追加」してから設定してください
              </p>
            </div>
            <button class="btn-ghost shrink-0" :disabled="pushBusy" @click="enablePush">
              {{ pushBusy ? '設定中…' : 'オンにする' }}
            </button>
          </div>
          <p v-if="pushMsg" class="mt-2 text-xs text-ink-400">{{ pushMsg }}</p>
        </div>

        <NuxtLink
          v-if="isSuperuser"
          to="/apps/settings"
          class="mt-6 inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-600"
        >
          設定・管理
          <Icon name="chevron_right" size="18" />
        </NuxtLink>
      </template>
    </main>
  </div>
</template>
