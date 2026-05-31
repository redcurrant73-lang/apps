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
  role?: string
}
interface A {
  id: string
  title: string
  icon: string
  visibility: string
  audience: string
}

const users = ref<U[]>([])
const apps = ref<A[]>([])
const grants = ref<Record<string, boolean>>({})
const pending = ref(false)
const msg = ref('')

const key = (uid: string, appId: string) => `${uid}_${appId}`

// superuser だけが常に全アプリ利用可(owner は通常ユーザー扱いで、個別に付与する)
const isAlways = (u: U, a: A) =>
  u.role === 'superuser' || a.visibility === 'always_visible'

const isChecked = (u: U, a: A) => isAlways(u, a) || !!grants.value[key(u.id, a.id)]

const load = async () => {
  pending.value = true
  try {
    const res = await $api('/api/admin/access')
    users.value = res.users
    apps.value = res.apps
    grants.value = res.grants
  } catch (e: any) {
    msg.value = e?.data?.message || e?.statusMessage || '読み込めませんでした'
  } finally {
    pending.value = false
  }
}

const toggle = async (u: U, a: A, ev: Event) => {
  const grant = (ev.target as HTMLInputElement).checked
  grants.value[key(u.id, a.id)] = grant
  try {
    await $api('/api/admin/access', { method: 'POST', body: { uid: u.id, appId: a.id, grant } })
  } catch (e: any) {
    grants.value[key(u.id, a.id)] = !grant
    msg.value = e?.data?.message || e?.statusMessage || '変更できませんでした'
  }
}

onMounted(load)
</script>

<template>
  <div>
    <AppHeader title="アクセス権" back="/apps/settings" />
    <main class="mx-auto max-w-3xl px-4 py-6">
      <p class="mb-3 text-sm text-slate-500">
        ユーザーごとに、使えるアプリをオン/オフできます。管理者は常に全アプリを使えます。
      </p>
      <p v-if="msg" class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{{ msg }}</p>
      <div v-if="pending" class="text-center text-slate-400">読み込み中…</div>

      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th class="sticky left-0 bg-slate-50 p-2 text-left">ユーザー</th>
              <th v-for="a in apps" :key="a.id" class="p-2 text-center">
                <div class="text-lg">{{ a.icon }}</div>
                <div class="text-xs font-normal text-slate-500">{{ a.title }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-t border-slate-100">
              <td class="sticky left-0 bg-white p-2">
                <div class="font-medium text-slate-800">{{ u.displayName || u.email }}</div>
                <div class="text-xs text-slate-400">{{ u.role }}</div>
              </td>
              <td v-for="a in apps" :key="a.id" class="p-2 text-center">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-brand"
                  :checked="isChecked(u, a)"
                  :disabled="isAlways(u, a)"
                  @change="toggle(u, a, $event)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
