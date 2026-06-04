<script setup lang="ts">
import QRCode from 'qrcode'

const { $api } = useNuxtApp() as any
const { ready, user } = useAuth()
const route = useRoute()

const isLoggedIn = computed(() => ready.value && !!user.value)

interface Term {
  word: string
  reading: string
  explanation: string
  explanationEn?: string
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
const loadError = ref(false)
const lang = ref<'ja' | 'en'>('ja')
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const imageUrl = ref('')
interface TermCtx { term: Term; dishIndex: number; termIndex: number }
const selectedTermCtx = ref<TermCtx | null>(null)
const termEditMode = ref(false)
const termEditForm = ref({ word: '', reading: '', explanation: '' })
const termSaveError = ref('')
const speaking = ref('')
const saving = ref(false)
const saveError = ref('')
const showQR = ref(false)
const qrDataUrl = ref('')
const showImageViewer = ref(false)
const viewerScale = ref(1)
const viewerTranslate = ref({ x: 0, y: 0 })
let _pinch: { dist: number; scale: number } | null = null
let _pan: { x: number; y: number; tx: number; ty: number } | null = null

const closeViewer = () => {
  showImageViewer.value = false
  viewerScale.value = 1
  viewerTranslate.value = { x: 0, y: 0 }
}

const onImgTouchStart = (e: TouchEvent) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    _pinch = { dist: Math.hypot(dx, dy), scale: viewerScale.value }
    _pan = null
  } else if (e.touches.length === 1) {
    _pinch = null
    _pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: viewerTranslate.value.x, ty: viewerTranslate.value.y }
  }
}

const onImgTouchMove = (e: TouchEvent) => {
  if (e.touches.length === 2 && _pinch) {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    viewerScale.value = Math.min(Math.max(_pinch.scale * (Math.hypot(dx, dy) / _pinch.dist), 1), 5)
  } else if (e.touches.length === 1 && _pan && viewerScale.value > 1) {
    viewerTranslate.value = {
      x: _pan.tx + (e.touches[0].clientX - _pan.x),
      y: _pan.ty + (e.touches[0].clientY - _pan.y),
    }
  }
}

const onImgTouchEnd = () => {
  if (viewerScale.value <= 1.05) {
    viewerScale.value = 1
    viewerTranslate.value = { x: 0, y: 0 }
  }
  _pinch = null
  _pan = null
}

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
      try {
        const blob = await $api(
          `/api/apps/kaiseki/image/${encodeURIComponent(menu.value.imageId)}`,
          { responseType: 'blob' },
        )
        imageUrl.value = URL.createObjectURL(blob as Blob)
      } catch {}
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
})

// ---- 用語編集 ----
const closeTermModal = () => {
  selectedTermCtx.value = null
  termEditMode.value = false
}

const startTermEdit = () => {
  if (!selectedTermCtx.value) return
  termEditForm.value = { ...selectedTermCtx.value.term }
  termEditMode.value = true
  termSaveError.value = ''
}

const saveTermEdit = async () => {
  if (!menu.value || !selectedTermCtx.value) return
  saving.value = true
  termSaveError.value = ''
  try {
    const result = await $api(`/api/apps/kaiseki/menus/${menu.value.id}`, {
      method: 'PATCH',
      body: {
        dishIndex: selectedTermCtx.value.dishIndex,
        termIndex: selectedTermCtx.value.termIndex,
        word: termEditForm.value.word,
        reading: termEditForm.value.reading,
        explanation: termEditForm.value.explanation,
      },
    })
    const dish = menu.value.dishes[selectedTermCtx.value.dishIndex]
    if (dish.terms) {
      const updated = {
        ...termEditForm.value,
        explanationEn: result?.explanationEn || dish.terms[selectedTermCtx.value.termIndex].explanationEn || '',
      }
      dish.terms[selectedTermCtx.value.termIndex] = updated
      selectedTermCtx.value = { ...selectedTermCtx.value, term: updated }
    }
    termEditMode.value = false
  } catch (e: any) {
    termSaveError.value = e?.data?.message || '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

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

// ---- QRコード ----
const openQR = async () => {
  const url = window.location.href
  qrDataUrl.value = await QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })
  showQR.value = true
}

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
    <AppHeader :title="menu?.title || '懐石メニュー'" back="/apps/kaiseki" />

    <main class="flex-1 overflow-x-hidden px-4 pb-28 pt-4">
      <div class="mx-auto max-w-2xl">
        <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

        <div v-else-if="loadError" class="py-10 text-center text-ink-400">
          メニューが見つかりませんでした
        </div>

        <template v-else-if="menu">
          <!-- お品書き写真（タップで拡大） -->
          <div
            v-if="imageUrl"
            class="mb-4 cursor-zoom-in overflow-hidden rounded-2xl shadow-sm"
            @click="showImageViewer = true"
          >
            <img :src="imageUrl" class="max-h-64 w-full object-cover" alt="お品書き" />
          </div>

          <!-- QRコードボタン (ログイン時のみ) -->
          <div v-if="isLoggedIn" class="mb-4 flex justify-end">
            <button
              class="flex items-center gap-1.5 rounded-xl bg-ink-100 px-3 py-2 text-xs font-medium text-ink-600 hover:bg-ink-200"
              @click="openQR"
            >
              <Icon name="qr_code_2" size="16" />
              QRコード
            </button>
          </div>

          <!-- 日本語表示 -->
          <div v-if="lang === 'ja'">
            <!-- 並べ替えバー (ログイン時のみ) -->
            <div v-if="isLoggedIn" class="mb-4 flex items-center justify-end gap-3">
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
                      v-if="isLoggedIn"
                      class="absolute right-3 top-3 rounded-full p-1 text-ink-300 hover:bg-ink-100 hover:text-ink-500"
                      @click="startEdit(dish)"
                    >
                      <Icon name="edit" size="16" />
                    </button>
                    <p :class="isLoggedIn ? 'pr-7' : ''" class="font-medium text-ink-800">
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
                        v-for="(term, ti) in dish.terms"
                        :key="term.word"
                        class="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 active:bg-brand-200"
                        @click="selectedTermCtx = { term, dishIndex: menu!.dishes.indexOf(dish), termIndex: ti }"
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

          <!-- 削除 (ログイン時のみ) -->
          <div v-if="isLoggedIn" class="mt-10 border-t border-ink-100 pt-4">
            <button class="text-sm text-red-400 hover:text-red-600" @click="showDeleteConfirm = true">
              このメニューを削除する
            </button>
          </div>
        </template>
      </div>
    </main>

    <!-- 言語切替（画面下部固定） -->
    <div
      class="fixed bottom-0 left-0 right-0 z-30 border-t border-ink-100 bg-white px-4 pt-3"
      style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
      <div class="mx-auto flex max-w-2xl overflow-hidden rounded-xl border border-ink-100">
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
    </div>

    <!-- モーダル：用語 -->
    <Transition name="fade">
      <div
        v-if="selectedTermCtx"
        class="fixed inset-0 z-50 bg-black/40"
        @click="closeTermModal"
      />
    </Transition>
    <Transition name="slide-up">
      <div
        v-if="selectedTermCtx"
        class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white px-6 pt-6 shadow-xl"
        style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom))"
      >
        <!-- 表示モード -->
        <template v-if="!termEditMode">
          <div class="mb-3 flex items-start justify-between gap-2">
            <div>
              <p class="text-lg font-bold text-ink-800">{{ selectedTermCtx.term.word }}</p>
              <p class="text-sm text-ink-400">（{{ selectedTermCtx.term.reading }}）</p>
            </div>
            <button
              v-if="isLoggedIn"
              class="rounded-full p-1.5 text-ink-300 hover:bg-ink-100 hover:text-ink-500"
              @click.stop="startTermEdit"
            >
              <Icon name="edit" size="18" />
            </button>
          </div>
          <p class="text-sm leading-relaxed text-ink-700">
            {{ (lang === 'en' && selectedTermCtx.term.explanationEn) ? selectedTermCtx.term.explanationEn : selectedTermCtx.term.explanation }}
          </p>
          <button
            class="mt-5 w-full rounded-xl bg-ink-100 py-2.5 text-sm font-medium text-ink-700"
            @click="closeTermModal"
          >
            閉じる
          </button>
        </template>

        <!-- 編集モード -->
        <template v-else>
          <h3 class="mb-4 font-semibold text-ink-800">用語を修正</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-ink-500">用語（漢字）</label>
              <input v-model="termEditForm.word" class="field w-full" />
            </div>
            <div>
              <label class="mb-1 block text-xs text-ink-500">読み方（ひらがな）</label>
              <input v-model="termEditForm.reading" class="field w-full" />
            </div>
            <div>
              <label class="mb-1 block text-xs text-ink-500">説明</label>
              <textarea v-model="termEditForm.explanation" class="field w-full" rows="4" />
            </div>
          </div>
          <p v-if="termSaveError" class="mt-2 text-xs text-red-500">{{ termSaveError }}</p>
          <div class="mt-5 flex gap-3">
            <button
              class="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm text-ink-700"
              @click="termEditMode = false"
            >
              キャンセル
            </button>
            <button
              class="btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
              :disabled="saving"
              @click="saveTermEdit"
            >
              {{ saving ? '保存中…' : '保存する' }}
            </button>
          </div>
        </template>
      </div>
    </Transition>

    <!-- モーダル：料理編集 -->
    <Transition name="fade">
      <div
        v-if="editingDish"
        class="fixed inset-0 z-50 bg-black/40"
        @click="editingDish = null"
      />
    </Transition>
    <Transition name="slide-up">
      <div
        v-if="editingDish"
        class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white px-6 pt-6 shadow-xl"
        style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom))"
      >
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
    </Transition>

    <!-- モーダル：削除確認 -->
    <Transition name="fade">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-50 bg-black/40"
        @click="showDeleteConfirm = false"
      />
    </Transition>
    <Transition name="slide-up">
      <div
        v-if="showDeleteConfirm"
        class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white px-6 pt-6 shadow-xl"
        style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom))"
      >
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
    </Transition>

    <!-- 写真ビューアー（ピンチで拡大縮小・1本指でパン） -->
    <Transition name="fade">
      <div
        v-if="showImageViewer"
        class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black"
        @click="closeViewer"
      >
        <button
          class="absolute right-4 z-10 rounded-full bg-black/60 p-2 text-white"
          style="top: max(1rem, env(safe-area-inset-top))"
          @click.stop="closeViewer"
        >
          <Icon name="close" size="24" />
        </button>
        <img
          :src="imageUrl"
          class="max-h-full max-w-full object-contain"
          :style="{
            transform: `translate(${viewerTranslate.x}px, ${viewerTranslate.y}px) scale(${viewerScale})`,
            transition: viewerScale === 1 ? 'transform 0.2s ease' : 'none',
            willChange: 'transform',
          }"
          alt="お品書き"
          @click.stop
          @touchstart="onImgTouchStart"
          @touchmove.prevent="onImgTouchMove"
          @touchend="onImgTouchEnd"
        />
      </div>
    </Transition>

    <!-- モーダル：QRコード -->
    <Transition name="fade">
      <div
        v-if="showQR"
        class="fixed inset-0 z-50 bg-black/40"
        @click="showQR = false"
      />
    </Transition>
    <Transition name="slide-up">
      <div
        v-if="showQR"
        class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white px-6 pt-6 shadow-xl"
        style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom))"
      >
        <h3 class="mb-4 text-center font-semibold text-ink-800">QRコード</h3>
        <div class="flex justify-center">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" class="h-48 w-48 rounded-xl" />
        </div>
        <p class="mt-3 text-center text-xs leading-relaxed text-ink-400">
          スクリーンショットして印刷すると<br />お客様がスマホで読み取れます
        </p>
        <button
          class="mt-5 w-full rounded-xl bg-ink-100 py-2.5 text-sm font-medium text-ink-700"
          @click="showQR = false"
        >
          閉じる
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
