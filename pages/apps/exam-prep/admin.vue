<script setup lang="ts">
// (superuser専用)各ユーザーに業種(クイズ)を割り当てる画面。
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

const assign = async (u: any, quizId: string) => {
  savingUid.value = u.uid
  savedUid.value = null
  errorMsg.value = ''
  try {
    await $api('/api/apps/exam-prep/admin/assign', {
      method: 'POST',
      body: { uid: u.uid, quizId: quizId || null },
    })
    u.quizId = quizId || null
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

const quizTitle = (id: string | null) =>
  quizzes.value.find((q) => q.id === id)?.title || '未割り当て'
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-ink-50">
    <AppHeader title="業種の割り当て" back="/apps/exam-prep" />
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
            この人がどの業種(学習内容)を勉強するかを設定します。変更すると、その人のレベルと進行中のセッションはリセットされます。
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
              <span class="shrink-0 text-xs text-ink-400">{{ u.totalAnswers }}問</span>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <select
                class="field flex-1"
                :value="u.quizId || ''"
                :disabled="savingUid === u.uid"
                @change="assign(u, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">未割り当て</option>
                <option v-for="q in quizzes" :key="q.id" :value="q.id">{{ q.title }}</option>
              </select>
              <span v-if="savingUid === u.uid" class="text-xs text-ink-400">保存中…</span>
              <Icon
                v-else-if="savedUid === u.uid"
                name="check_circle"
                size="20"
                class="text-emerald-600"
              />
            </div>
          </div>

          <p v-if="!users.length" class="py-6 text-center text-sm text-ink-400">
            ユーザーがいません
          </p>
          <p v-if="errorMsg" class="text-center text-sm text-red-600">{{ errorMsg }}</p>
        </template>
      </div>
    </main>
  </div>
</template>
