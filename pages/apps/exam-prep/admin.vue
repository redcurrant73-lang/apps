<script setup lang="ts">
// (superuser専用)各ユーザーに使える学習内容(role = 複数可)を割り当てる。
const { $api } = useNuxtApp() as any
const { ready, user, isSuperuser } = useAuth()

const loading = ref(true)
const denied = ref(false)
const users = ref<any[]>([])
const quizzes = ref<any[]>([])
const savingUid = ref<string | null>(null)
const savedUid = ref<string | null>(null)
const errorMsg = ref('')

const load = async () => {
  try {
    const r = await $api('/api/apps/exam-prep/admin/users')
    users.value = r.users
    quizzes.value = r.quizzes
  } catch (e: any) {
    if ((e?.statusCode || e?.response?.status) === 403) denied.value = true
    else errorMsg.value = e?.data?.message || '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}

watch(
  [ready, user],
  () => {
    if (!ready.value) return
    if (!user.value) {
      navigateTo('/login')
      return
    }
    if (!isSuperuser.value) {
      denied.value = true
      loading.value = false
      return
    }
    load()
  },
  { immediate: true },
)

const toggleRole = async (u: any, quizId: string, checked: boolean) => {
  const set = new Set<string>(u.roles || [])
  if (checked) set.add(quizId)
  else set.delete(quizId)
  const roles = [...set]
  savingUid.value = u.uid
  savedUid.value = null
  errorMsg.value = ''
  try {
    await $api('/api/apps/exam-prep/admin/assign', { method: 'POST', body: { uid: u.uid, roles } })
    u.roles = roles
    savedUid.value = u.uid
    setTimeout(() => {
      if (savedUid.value === u.uid) savedUid.value = null
    }, 1500)
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '保存に失敗しました'
  } finally {
    savingUid.value = null
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-ink-50">
    <AppHeader title="学習内容の割り当て" back="/apps/exam-prep" />
    <main class="flex-1 overflow-y-auto px-4 py-4">
      <div class="mx-auto max-w-xl space-y-3">
        <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

        <div v-else-if="denied" class="card text-center text-ink-600">
          <span
            class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"
          >
            <Icon name="lock" size="28" />
          </span>
          <p>この画面は管理者(スーパーユーザー)専用です。</p>
        </div>

        <template v-else>
          <p class="text-sm text-ink-500">
            この人が使える学習内容(role)をチェックで選びます(複数OK)。チェックを外して今やっている内容が無くなった場合だけ、その人の進行中セッションがリセットされます。
          </p>

          <div v-for="u in users" :key="u.uid" class="card">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-medium text-ink-800">{{ u.displayName || u.email || u.uid }}</p>
                <p class="truncate text-xs text-ink-400">
                  {{ u.email }}
                  <span v-if="u.role !== 'user'" class="ml-1 rounded bg-ink-100 px-1 text-ink-500">{{ u.role }}</span>
                </p>
              </div>
              <span v-if="savingUid === u.uid" class="shrink-0 text-xs text-ink-400">保存中…</span>
              <Icon
                v-else-if="savedUid === u.uid"
                name="check_circle"
                size="20"
                class="shrink-0 text-emerald-600"
              />
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <label
                v-for="q in quizzes"
                :key="q.id"
                class="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm"
                :class="(u.roles || []).includes(q.id) ? 'border-brand bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600'"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-brand"
                  :checked="(u.roles || []).includes(q.id)"
                  :disabled="savingUid === u.uid"
                  @change="toggleRole(u, q.id, ($event.target as HTMLInputElement).checked)"
                />
                {{ q.title }}
              </label>
            </div>
            <p v-if="u.role === 'superuser'" class="mt-1 text-xs text-ink-400">
              ※ 管理者はチェックに関係なく全部使えます
            </p>
          </div>

          <p v-if="!users.length" class="py-6 text-center text-sm text-ink-400">ユーザーがいません</p>
          <p v-if="errorMsg" class="text-center text-sm text-red-600">{{ errorMsg }}</p>
        </template>
      </div>
    </main>
  </div>
</template>
