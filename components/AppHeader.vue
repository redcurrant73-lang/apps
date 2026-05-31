<script setup lang="ts">
defineProps<{ title?: string; back?: string }>()
const { profile, isSuperuser, logout } = useAuth()
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur"
  >
    <NuxtLink
      v-if="back"
      :to="back"
      class="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
      aria-label="戻る"
    >
      ←
    </NuxtLink>
    <NuxtLink v-else to="/" class="text-lg font-bold text-brand"> apps </NuxtLink>

    <h1 v-if="title" class="truncate text-base font-semibold text-slate-800">{{ title }}</h1>

    <div class="ml-auto flex items-center gap-2">
      <NuxtLink
        v-if="isSuperuser"
        to="/apps/settings"
        class="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
        aria-label="設定"
      >
        ⚙️
      </NuxtLink>
      <img
        v-if="profile?.photoURL"
        :src="profile.photoURL"
        referrerpolicy="no-referrer"
        class="h-8 w-8 rounded-full ring-1 ring-slate-200"
        alt=""
      />
      <button class="text-sm text-slate-500 hover:text-slate-800" @click="logout">
        ログアウト
      </button>
    </div>
  </header>
</template>
