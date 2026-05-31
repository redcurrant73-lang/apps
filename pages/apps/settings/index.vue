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
  { to: '/apps/settings/users', icon: 'group', title: 'ユーザー管理', desc: '一覧・ロール変更・削除' },
  { to: '/apps/settings/access', icon: 'vpn_key', title: 'アクセス権', desc: '誰がどのアプリを使えるか' },
  { to: '/apps/settings/billing', icon: 'analytics', title: '料金・使用量', desc: 'AI呼び出し回数など' },
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
        class="card-tap flex items-center gap-4"
      >
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
        >
          <Icon :name="it.icon" size="24" />
        </span>
        <span class="flex-1">
          <span class="block font-semibold text-ink-800">{{ it.title }}</span>
          <span class="block text-sm text-ink-400">{{ it.desc }}</span>
        </span>
        <Icon name="chevron_right" size="20" class="text-ink-200" />
      </NuxtLink>
    </main>
  </div>
</template>
