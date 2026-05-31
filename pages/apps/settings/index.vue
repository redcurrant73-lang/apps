<script setup lang="ts">
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

const items = [
  { to: '/apps/settings/users', icon: '👥', title: 'ユーザー管理', desc: '一覧・ロール変更・削除' },
  { to: '/apps/settings/access', icon: '🔑', title: 'アクセス権', desc: '誰がどのアプリを使えるか' },
  { to: '/apps/settings/billing', icon: '📊', title: '料金・使用量', desc: 'AI呼び出し回数など' },
]
</script>

<template>
  <div>
    <AppHeader title="設定" back="/" />
    <main class="mx-auto max-w-2xl space-y-3 px-4 py-6">
      <NuxtLink
        v-for="it in items"
        :key="it.to"
        :to="it.to"
        class="card flex items-center gap-4 transition hover:shadow-md"
      >
        <span class="text-3xl">{{ it.icon }}</span>
        <span class="flex-1">
          <span class="block font-semibold text-slate-800">{{ it.title }}</span>
          <span class="block text-sm text-slate-500">{{ it.desc }}</span>
        </span>
        <span class="text-slate-300">→</span>
      </NuxtLink>
    </main>
  </div>
</template>
