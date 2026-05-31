<script setup lang="ts">
defineProps<{ title?: string; back?: string }>()
const { profile, isSuperuser, logout } = useAuth()
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center gap-1 border-b border-ink-100 bg-white/90 px-3 py-2.5 backdrop-blur"
  >
    <NuxtLink v-if="back" :to="back" class="btn-icon" aria-label="戻る">
      <Icon name="arrow_back" size="22" />
    </NuxtLink>
    <NuxtLink v-else to="/" class="px-2 text-lg font-bold text-brand"> apps </NuxtLink>

    <h1 v-if="title" class="truncate text-base font-semibold text-ink-800">{{ title }}</h1>

    <div class="ml-auto flex items-center gap-1">
      <NuxtLink v-if="isSuperuser" to="/apps/settings" class="btn-icon" aria-label="設定">
        <Icon name="settings" size="22" />
      </NuxtLink>
      <img
        v-if="profile?.photoURL"
        :src="profile.photoURL"
        referrerpolicy="no-referrer"
        class="ml-1 h-8 w-8 rounded-full ring-1 ring-ink-200"
        alt=""
      />
      <button
        class="ml-1 rounded-lg px-2 py-1 text-sm text-ink-600 transition hover:bg-ink-100"
        @click="logout"
      >
        ログアウト
      </button>
    </div>
  </header>
</template>
