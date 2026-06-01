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

interface Term {
  word: string
  reading: string
  explanation: string
}

interface Dish {
  nameJa: string
  reading: string
  category: string
  descriptionJa: string
  terms?: Term[]
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
  categoryOrder?: string[]
}

const menu = ref<Menu | null>(null)
const loading = ref(true)
const lang = ref<'ja' | 'en'>('ja')
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const imageUrl = ref('')
const selectedTerm = ref<Term | null>(null)
const speaking = ref('')
const saving = ref(false)
const saveError = ref('')

// ---- 料理編集 ----
interface EditForm { nameJa: string; reading: string; descriptionJa: string }
const editingDish = ref<{ dish: Dish; index: number } | null>(null)
const editForm = ref<EditForm>({ nameJa: '', reading: '', descriptionJa: '' })

const startEdit = (dish: Dish) => {
  const index = menu.value!.dishes.indexOf(dish)
  editingDish.value = { dish, index }
  editForm.value = { nameJa: dish.nameJa, reading: dish.reading, descriptionJa: dish.descriptionJa }
  saveError.value = ''
}

const saveEdit = async () => {
  if (!menu.value || !editingDish.value) return
  saving.value = true
  saveError.value = ''
  try {
    await $api(`/api/apps/kaiseki/menus/${menu.value.id}`, {
      method: 'PATCH',
      body: {
        dishIndex: editingDish.value.index,
        nameJa: editForm.value.nameJa,
        reading: editForm.value.reading,
        descriptionJa: editForm.value.descriptionJa,
      },
    })
    const dish = editingDish.value.dish
    dish.nameJa = editForm.value.nameJa
    dish.reading = editForm.value.reading
    dish.descriptionJa = editForm.value.descriptionJa
    editingDish.value = null
  } catch (e: any) {
    saveError.value = e?.data?.message || '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

// ---- カテゴリー順 ----
const KAISEKI_ORDER = ['先付', '前八寸', 'お椀', '造り', '焼物', '煮物', '進肴', '食事', '甘味']
const EN_ORDER = [
  'Amuse-Bouche', 'Appetizer', 'Soup', 'Sashimi', 'Grilled',
  'Simmered', 'Fried', 'Steamed', 'Rice Course', 'Seasonal Fruits', 'Dessert',
]

function buildGroups(dishes: Dish[], key: 'category' | 'categoryEn', fallback: string) {
  const map = new Map<string, Dish[]>()
  for (const d of dishes) {
    const cat = d[key] || fallback
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(d)
  }
  return map
}

function sortByOrder(entries: { cat: string; dishes: Dish[] }[], order: string[]) {
  return [...entries].sort((a, b) => {
    const ia = order.indexOf(a.cat)
    const ib = order.indexOf(b.cat)
    if (ia === -1 && ib === -1) return 0
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

const groupedJa = computed(() => {
  if (!menu.value) return []
  const map = buildGroups(menu.value.dishes, 'category', 'その他')
  const groups = [...map.entries()].map(([cat, dishes]) => ({ cat, dishes }))
  const order = menu.value.categoryOrder?.length ? menu.value.categoryOrder : KAISEKI_ORDER
  return sortByOrder(groups, order)
})

const groupedEn = computed(() => {
  if (!menu.value) return []
  const map = buildGroups(menu.value.dishes, 'categoryEn', 'Other')
  const groups = [...map.entries()].map(([cat, dishes]) => ({ cat, dishes }))
  return sortByOrder(groups, EN_ORDER)
})

// ---- カテゴリー順の並べ替え ----
const reorderMode = ref(false)
const editCategoryOrder = ref<string[]>([])

const reorderGroups = computed(() => {
  if (!menu.value) return []
  const map = buildGroups(menu.value.dishes, 'category', 'その他')
  return editCategoryOrder.value
    .map((cat) => ({ cat, dishes: map.get(cat) || [] }))
    .filter((g) => g.dishes.length > 0)
})

const startReorder = () => {
  editCategoryOrder.value = groupedJa.value.map((g) => g.cat)
  reorderMode.value = true
  saveError.value = ''
}

const cancelReorder = () => {
  reorderMode.value = false
  editCategoryOrder.value = []
}

const moveCategory = (index: number, dir: -1 | 1) => {
  const arr = [...editCategoryOrder.value]
  const ni = index + dir
  if (ni < 0 || ni >= arr.length) return
  ;[arr[index], arr[ni]] = [arr[ni], arr[index]]
  editCategoryOrder.value = arr
}

const saveOrder = async () => {
  if (!menu.value) return
  saving.value = true
  saveError.value = ''
  try {
    await $api(`/api/apps/kaiseki/menus/${menu.value.id}`, {
      method: 'PATCH',
      body: { categoryOrder: editCategoryOrder.value },
    })
    menu.value.categoryOrder = [...editCategoryOrder.value]
    reorderMode.value = false
  } catch (e: any) {
    saveError.value = e?.data?.message || '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

// ---- 初期ロード ----
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
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
})

// ---- 英語発音 ----
const speak = (text: string) => {
  if (!('speechSynthesis' in window)) return
  try {
    const clean = text.replace(/[,.:;!?]+$/g, '').trim()
    if (!clean) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.lang = 'en-US'
    utterance.rate = 0.85
    speaking.value = clean
    utterance.onend = () => { speaking.value = '' }
    utterance.onerror = () => { speaking.value = '' }
    window.speechSynthesis.speak(utterance)
  } catch {
    speaking.value = ''
  }
}

const wordsOf = (text: string) => text.split(' ').filter(Boolean)

// ---- 削除 ----
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
  <div class="flex min-h-dvh flex-col overflow-x-hidden">
    <AppHeader :title="menu?.title || '読み込み中…'" back="/apps/kaiseki" />

    <main class="flex-1 overflow-x-hidden px-4 py-4">
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
          <div v-if="lang === 'ja'">
            <!-- 並べ替えバー -->
            <div class="mb-4 flex items-center justify-end gap-3">
              <template v-if="!reorderMode">
                <button
                  class="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-600"
                  @click="startReorder"
                >
                  <Icon name="swap_vert" size="16" />
                  順番を変える
                </button>
              </template>
              <template v-else>
                <p v-if="saveError" class="flex-1 text-xs text-red-500">{{ saveError }}</p>
                <button class="text-xs text-ink-400 hover:text-ink-600" @click="cancelReorder">
                  キャンセル
                </button>
                <button
                  class="text-xs font-semibold text-brand disabled:opacity-50"
                  :disabled="saving"
                  @click="saveOrder"
                >
                  {{ saving ? '保存中…' : '完了' }}
                </button>
              </template>
            </div>

            <div class="space-y-6">
              <div
                v-for="(group, gi) in reorderMode ? reorderGroups : groupedJa"
                :key="group.cat"
              >
                <!-- カテゴリーヘッダー -->
                <div class="mb-3 flex items-center gap-2">
                  <div v-if="reorderMode" class="flex flex-col">
                    <button
                      class="rounded p-0.5 text-ink-400 disabled:opacity-30 hover:text-ink-600"
                      :disabled="gi === 0"
                      @click="moveCategory(gi, -1)"
                    >
                      <Icon name="keyboard_arrow_up" size="20" />
                    </button>
                    <button
                      class="rounded p-0.5 text-ink-400 disabled:opacity-30 hover:text-ink-600"
                      :disabled="gi === (reorderMode ? reorderGroups : groupedJa).length - 1"
                      @click="moveCategory(gi, 1)"
                    >
                      <Icon name="keyboard_arrow_down" size="20" />
                    </button>
                  </div>
                  <h2
                    class="flex-1 border-b border-ink-100 pb-1 text-xs font-semibold tracking-widest text-ink-400"
                  >
                    {{ group.cat }}
                  </h2>
                </div>

                <div class="space-y-3">
                  <div v-for="dish in group.dishes" :key="dish.nameJa" class="card relative">
                    <button
                      class="absolute right-3 top-3 rounded-full p-1 text-ink-300 hover:bg-ink-100 hover:text-ink-500"
                      @click="startEdit(dish)"
                    >
                      <Icon name="edit" size="16" />
                    </button>
                    <p class="pr-7 font-medium text-ink-800">
                      {{ dish.nameJa
                      }}<span class="ml-1.5 text-sm font-normal text-ink-400"
                        >（{{ dish.reading }}）</span
                      >
                    </p>
                    <p v-if="dish.descriptionJa" class="mt-1.5 text-sm leading-relaxed text-ink-600">
                      {{ dish.descriptionJa }}
                    </p>
                    <!-- 用語チップ -->
                    <div v-if="dish.terms?.length" class="mt-2.5 flex flex-wrap gap-1.5">
                      <button
                        v-for="term in dish.terms"
                        :key="term.word"
                        class="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 active:bg-brand-200"
                        @click="selectedTerm = term"
                      >
                        {{ term.word }} とは？
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 英語表示 -->
          <div v-else class="space-y-8">
            <p class="mb-2 text-center text-xs text-ink-400">単語をタップすると発音が聞けます</p>
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
                  <div class="flex min-w-0 items-start justify-between gap-2">
                    <p class="min-w-0 flex-1 break-words font-semibold leading-relaxed text-ink-800">
                      <span
                        v-for="(word, wi) in wordsOf(dish.nameEn)"
                        :key="wi"
                        class="cursor-pointer rounded px-0.5 transition-colors hover:bg-brand-50 hover:text-brand active:bg-brand-100"
                        :class="{ 'bg-brand-50 text-brand': speaking === word.replace(/[,.:;!?]+$/g, '').trim() }"
                        @click="speak(word)"
                      >{{ word }} </span>
                    </p>
                    <button
                      class="flex-shrink-0 rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
                      :class="{ 'bg-brand-50 text-brand': speaking === (dish.nameEn + '. ' + dish.descriptionEn).replace(/[,.:;!?]+$/g, '').trim() }"
                      @click="speak(dish.nameEn + '. ' + dish.descriptionEn)"
                    >
                      <Icon name="volume_up" size="18" />
                    </button>
                  </div>
                  <p class="mt-1 text-sm italic leading-relaxed text-ink-500">
                    {{ dish.descriptionEn }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 削除 -->
          <div class="mt-10 border-t border-ink-100 pt-4">
            <button class="text-sm text-red-400 hover:text-red-600" @click="showDeleteConfirm = true">
              このメニューを削除する
            </button>
          </div>

          <!-- 編集モーダル -->
          <div
            v-if="editingDish"
            class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8"
            @click.self="editingDish = null"
          >
            <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 class="mb-4 font-semibold text-ink-800">料理情報を修正</h3>
              <div class="space-y-3">
                <div>
                  <label class="mb-1 block text-xs text-ink-500">料理名</label>
                  <input v-model="editForm.nameJa" class="field w-full" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-ink-500">読み方（ひらがな）</label>
                  <input v-model="editForm.reading" class="field w-full" placeholder="ひらがなで入力" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-ink-500">解説</label>
                  <textarea v-model="editForm.descriptionJa" class="field w-full" rows="3" />
                </div>
              </div>
              <p v-if="saveError" class="mt-2 text-xs text-red-500">{{ saveError }}</p>
              <div class="mt-5 flex gap-3">
                <button
                  class="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm text-ink-700"
                  @click="editingDish = null"
                >
                  キャンセル
                </button>
                <button
                  class="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
                  :disabled="saving"
                  @click="saveEdit"
                >
                  {{ saving ? '保存中…' : '保存する' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 用語モーダル -->
          <div
            v-if="selectedTerm"
            class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8"
            @click.self="selectedTerm = null"
          >
            <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <p class="mb-0.5 text-lg font-bold text-ink-800">{{ selectedTerm.word }}</p>
              <p class="mb-3 text-sm text-ink-400">（{{ selectedTerm.reading }}）</p>
              <p class="text-sm leading-relaxed text-ink-700">{{ selectedTerm.explanation }}</p>
              <button
                class="mt-5 w-full rounded-xl bg-ink-100 py-2.5 text-sm font-medium text-ink-700"
                @click="selectedTerm = null"
              >
                閉じる
              </button>
            </div>
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
