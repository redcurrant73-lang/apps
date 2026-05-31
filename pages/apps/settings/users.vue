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

interface U {
  id: string
  email?: string
  displayName?: string
  photoURL?: string
  role?: string
  createdAt?: string
}

const users = ref<U[]>([])
const pending = ref(false)
const msg = ref('')

const load = async () => {
  pending.value = true
  try {
    const res = await $api('/api/admin/users')
    users.value = res.users
  } catch (e: any) {
    msg.value = e?.data?.message || e?.statusMessage || '読み込めませんでした'
  } finally {
    pending.value = false
  }
}

const setRole = async (u: U, role: string) => {
  msg.value = ''
  try {
    await $api('/api/admin/users', { method: 'POST', body: { action: 'setRole', uid: u.id, role } })
    u.role = role
  } catch (e: any) {
    msg.value = e?.data?.message || e?.statusMessage || '変更できませんでした'
    await load()
  }
}

const remove = async (u: U) => {
  if (!confirm(`${u.displayName || u.email} を削除しますか?`)) return
  try {
    await $api('/api/admin/users', { method: 'POST', body: { action: 'delete', uid: u.id } })
    users.value = users.value.filter((x) => x.id !== u.id)
  } catch (e: any) {
    msg.value = e?.data?.message || e?.statusMessage || '削除できませんでした'
  }
}

onMounted(load)
</script>

<template>
  <div>
    <AppHeader title="ユーザー管理" back="/apps/settings" />
    <main class="mx-auto max-w-2xl space-y-3 px-4 py-6">
      <p v-if="msg" class="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{{ msg }}</p>
      <div v-if="pending" class="text-center text-slate-400">読み込み中…</div>

      <div v-for="u in users" :key="u.id" class="card flex items-center gap-3">
        <img
          v-if="u.photoURL"
          :src="u.photoURL"
          referrerpolicy="no-referrer"
          class="h-10 w-10 rounded-full ring-1 ring-slate-200"
          alt=""
        />
        <div v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          {{ (u.displayName || u.email || '?').slice(0, 1) }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-slate-800">{{ u.displayName || '(名前未設定)' }}</p>
          <p class="truncate text-xs text-slate-500">{{ u.email }}</p>
        </div>
        <select
          :value="u.role"
          class="rounded-lg border border-slate-200 px-2 py-1 text-sm"
          @change="setRole(u, ($event.target as HTMLSelectElement).value)"
        >
          <option value="user">一般</option>
          <option value="superuser">管理者</option>
          <option value="owner">オーナー</option>
        </select>
        <button class="text-sm text-red-500 hover:text-red-700" @click="remove(u)">削除</button>
      </div>

      <div v-if="!pending && users.length === 0" class="text-center text-slate-400">
        ユーザーがいません
      </div>
    </main>
  </div>
</template>
