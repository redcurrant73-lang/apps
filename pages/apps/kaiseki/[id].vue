<script setup lang="ts">
const { $api } = useNuxtApp() as any
const { ready, user } = useAuth()
const route = useRoute()

watch(
  [ready, user],
  () => {
    if (ready.value && !user.value) navigateTo('/login')
  },
  { immediate: true },
)

interface Dish {
  nameJa: string
  reading: string
  category: string
  descriptionJa: string
  nameEn: string
  categoryEn: string
  descriptionEn: string
}

interface Menu {
  id: string
  title: string
  imageId: string
  dishes: Dish[]
  createdAt: string
}

const menu = ref<Menu | null>(null)
const loading = ref(true)
const lang = ref<'ja' | 'en'>('ja')
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const imageUrl = ref('')

onMounted(async () => {
  try {
    menu.value = await $api(`/api/apps/kaiseki/menus/${route.params.id}`)
    if (menu.value?.imageId) {
      const blob = await $api(
        `/api/apps/kaiseki/image/${encodeURIComponent(menu.value.imageId)}`,
        { responseType: 'blob' },
      )
      imageUrl.value = URL.createObjectURL(blob as Blob)
    }
  } catch {
    navigateTo('/apps/kaiseki')
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})

const groupedJa = computed(() => {
  if (!menu.value) return []
  const map = new Map<string, Dish[]>()
  for (const d of menu.value.dishes) {
    const cat = d.category || 'その他'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(d)
  }
  return [...map.entries()].map(([cat, dishes]) => ({ cat, dishes }))
})

const groupedEn = computed(() => {
  if (!menu.value) return []
  const map = new Map<string, Dish[]>()
  for (const d of menu.value.dishes) {
    const cat = d.categoryEn || 'Other'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(d)
  }
  return [...map.entries()].map(([cat, dishes]) => ({ cat, dishes }))
})

const deleteMenu = async () => {
  if (!menu.value) return
  deleting.value = true
  try {
    await $api(`/api/apps/kaiseki/menus/${menu.value.id}`, { method: 'DELETE' })
    navigateTo('/apps/kaiseki')
  } catch {
    deleting.value = false
    showDeleteConfirm.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <AppHeader :title="menu?.title || '読み込み中…'" back="/apps/kaiseki" />

    <main class="flex-1 px-4 py-4">
      <div class="mx-auto max-w-2xl">
        <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

        <template v-else-if="menu">
          <!-- お品書き写真 -->
          <div v-if="imageUrl" class="mb-4 overflow-hidden rounded-2xl shadow-sm">
            <img :src="imageUrl" class="max-h-64 w-full object-cover" alt="お品書き" />
          </div>

          <!-- 言語切替 -->
          <div class="mb-6 flex overflow-hidden rounded-xl border border-ink-100">
            <button
              class="flex-1 py-2.5 text-sm font-medium transition-colors"
              :class="lang === 'ja' ? 'bg-brand text-white' : 'text-ink-600 hover:bg-ink-50'"
              @click="lang = 'ja'"
            >
              日本語
            </button>
            <button
              class="flex-1 py-2.5 text-sm font-medium transition-colors"
              :class="lang === 'en' ? 'bg-brand text-white' : 'text-ink-600 hover:bg-ink-50'"
              @click="lang = 'en'"
            >
              English
            </button>
          </div>

          <!-- 日本語表示 -->
          <div v-if="lang === 'ja'" class="space-y-6">
            <div v-for="group in groupedJa" :key="group.cat">
              <h2
                class="mb-3 border-b border-ink-100 pb-1 text-xs font-semibold tracking-widest text-ink-400"
              >
                {{ group.cat }}
              </h2>
              <div class="space-y-3">
                <div v-for="dish in group.dishes" :key="dish.nameJa" class="card">
                  <p class="font-medium text-ink-800">
                    {{ dish.nameJa
                    }}<span class="ml-1.5 text-sm font-normal text-ink-400"
                      >（{{ dish.reading }}）</span
                    >
                  </p>
                  <p class="mt-1.5 text-sm leading-relaxed text-ink-600">
                    {{ dish.descriptionJa }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 英語表示 -->
          <div v-else class="space-y-8">
            <div v-for="group in groupedEn" :key="group.cat">
              <div class="mb-4 flex items-center gap-3">
                <div class="h-px flex-1 bg-ink-200" />
                <span class="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
                  {{ group.cat }}
                </span>
                <div class="h-px flex-1 bg-ink-200" />
              </div>
              <div class="space-y-4">
                <div v-for="dish in group.dishes" :key="dish.nameEn" class="card">
                  <p class="font-semibold text-ink-800">{{ dish.nameEn }}</p>
                  <p class="mt-1 text-sm italic leading-relaxed text-ink-500">
                    {{ dish.descriptionEn }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 削除 -->
          <div class="mt-10 border-t border-ink-100 pt-4">
            <button
              class="text-sm text-red-400 hover:text-red-600"
              @click="showDeleteConfirm = true"
            >
              このメニューを削除する
            </button>
          </div>

          <!-- 削除確認モーダル -->
          <div
            v-if="showDeleteConfirm"
            class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8"
            @click.self="showDeleteConfirm = false"
          >
            <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <p class="mb-2 font-medium text-ink-800">このメニューを削除してもいいですか？</p>
              <p class="mb-6 text-sm text-ink-500">写真と解析データが削除されます。元に戻せません。</p>
              <div class="flex gap-3">
                <button
                  class="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm text-ink-700"
                  @click="showDeleteConfirm = false"
                >
                  キャンセル
                </button>
                <button
                  class="flex-1 rounded-xl bg-red-500 py-2.5 text-sm text-white disabled:opacity-50"
                  :disabled="deleting"
                  @click="deleteMenu"
                >
                  {{ deleting ? '削除中…' : '削除する' }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
