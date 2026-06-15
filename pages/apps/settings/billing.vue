<script setup lang="ts">
const { $api } = useNuxtApp() as any
const { ready, user, profile } = useAuth()

watch(
  [ready, user, profile],
  () => {
    if (!ready.value) return
    if (!user.value) return navigateTo('/login')
    if (profile.value && profile.value.role === 'user') navigateTo('/')
  },
  { immediate: true },
)

const data = ref<any>(null)
const pending = ref(false)
const msg = ref('')

const load = async () => {
  pending.value = true
  try {
    data.value = await $api('/api/admin/billing')
  } catch (e: any) {
    msg.value = e?.data?.message || e?.statusMessage || '読み込めませんでした'
  } finally {
    pending.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <AppHeader title="料金・使用量" back="/apps/settings" />
    <main class="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <p v-if="msg" class="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{{ msg }}</p>
      <div v-if="pending" class="text-center text-slate-400">読み込み中…</div>

      <template v-else-if="data">
        <div class="card">
          <p class="text-sm text-slate-500">{{ data.usage.month }} のAI使用量</p>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="text-4xl font-bold text-slate-900"
              >¥{{ Math.round(data.usage.estimatedCostJpy).toLocaleString() }}</span
            >
            <span class="text-sm text-slate-500">推定AI料金</span>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p class="text-2xl font-bold text-slate-900">{{ data.usage.geminiCalls }}</p>
              <p class="text-xs text-slate-500">呼び出し回数</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-slate-900">{{ data.usage.geminiTokensIn }}</p>
              <p class="text-xs text-slate-500">入力トークン</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-slate-900">{{ data.usage.geminiTokensOut }}</p>
              <p class="text-xs text-slate-500">出力トークン</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="flex justify-between text-sm">
            <span class="text-slate-500">登録ユーザー数</span>
            <span class="font-medium text-slate-800">{{ data.stats.users }}</span>
          </div>
          <div class="mt-2 flex justify-between text-sm">
            <span class="text-slate-500">アクセス権の付与数</span>
            <span class="font-medium text-slate-800">{{ data.stats.appGrants }}</span>
          </div>
        </div>

        <div v-if="data.usage.days?.length" class="card">
          <p class="mb-2 text-sm font-medium text-slate-700">日別のAI呼び出し・料金</p>
          <div
            v-for="d in data.usage.days"
            :key="d.date"
            class="flex justify-between border-t border-slate-100 py-1 text-sm first:border-0"
          >
            <span class="text-slate-500">{{ d.date }}</span>
            <span class="text-slate-800"
              >{{ d.geminiCalls }}回
              <span class="ml-1 text-slate-400">¥{{ Math.round(d.costJpy).toLocaleString() }}</span></span
            >
          </div>
        </div>

        <p class="px-1 text-xs text-slate-400">{{ data.usage.priceNote }}</p>
        <p class="px-1 text-xs text-slate-400">{{ data.usage.costNote }}</p>
      </template>
    </main>
  </div>
</template>
