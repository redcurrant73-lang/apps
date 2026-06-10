<script setup lang="ts">
const { $api } = useNuxtApp() as any
const { ready, user } = useAuth()

watch([ready, user], () => {
  if (ready.value && !user.value) navigateTo('/login')
}, { immediate: true })

type Tab = 'choose' | 'ocr' | 'routes' | 'manual'
const tab = ref<Tab>('choose')

// ---- Shared data ----
const savedAddressees = ref<string[]>([])
const savedProjectNames = ref<string[]>([])
const defaultProjectName = ref('')

// ---- OCR flow ----
const fileInput = ref<HTMLInputElement | null>(null)
const ocrLoading = ref(false)
const ocrError = ref('')
const ocrResult = ref<{ date: string; from: string; to: string; amount: number; trainName: string | null; notes: string | null } | null>(null)
const ocrAddresseeInput = ref('')
const ocrSaveNewAddressee = ref(false)
const ocrProjectName = ref('')
const ocrPayee = ref('JR東海')
const ocrHasReceipt = ref(true)

// ---- Routes flow ----
interface SavedRoute { id: string; name: string; from: string; to: string; type: string; amount: number; payee?: string; projectName?: string; hasReceipt?: boolean }
const routes = ref<SavedRoute[]>([])
const routesLoading = ref(true)
const selectedRoute = ref<SavedRoute | null>(null)
const routeDate = ref(todayStr())
const routeDirection = ref<'outbound' | 'return' | 'round' | 'one-way'>('outbound')

// ---- Manual form ----
const manualDate = ref(todayStr())
const manualType = ref('train')
const manualFrom = ref('')
const manualTo = ref('')
const manualAmount = ref('')
const manualDirection = ref<'outbound' | 'return' | 'round' | 'one-way'>('outbound')
const manualAddressee = ref('')
const manualNotes = ref('')
const manualProjectName = ref('')
const manualPayee = ref('')
const manualHasReceipt = ref(false)

const saving = ref(false)
const saveError = ref('')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(async () => {
  const [routeRes, settings] = await Promise.all([
    $api('/api/apps/expense/routes').catch(() => []),
    $api('/api/apps/expense/settings').catch(() => ({})),
  ])
  routes.value = routeRes
  savedAddressees.value = settings.savedAddressees || []
  savedProjectNames.value = settings.savedProjectNames || []
  defaultProjectName.value = settings.defaultProjectName || ''
  ocrProjectName.value = settings.defaultProjectName || ''
  manualProjectName.value = settings.defaultProjectName || ''
  routesLoading.value = false
})

// --- OCR ---
async function readFile(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type === 'application/pdf') {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res({ base64: (r.result as string).split(',')[1] || '', mimeType: 'application/pdf' })
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }
  const maxDim = 1600
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85))
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1] || '')
    r.onerror = rej
    r.readAsDataURL(blob)
  })
  return { base64, mimeType: 'image/jpeg' }
}

const pickReceipt = () => fileInput.value?.click()

async function onReceiptChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (fileInput.value) fileInput.value.value = ''
  ocrLoading.value = true; ocrError.value = ''; ocrResult.value = null
  try {
    const { base64, mimeType } = await readFile(file)
    const res = await $api('/api/apps/expense/ocr', { method: 'POST', body: { image: base64, mimeType } })
    ocrResult.value = res
  } catch (err: any) {
    ocrError.value = err?.data?.message || '読み取りに失敗しました。もう一度お試しください。'
  } finally {
    ocrLoading.value = false
  }
}

async function saveOcr() {
  if (!ocrResult.value) return
  saving.value = true; saveError.value = ''
  try {
    const addressee = ocrAddresseeInput.value.trim()
    if (addressee && ocrSaveNewAddressee.value && !savedAddressees.value.includes(addressee)) {
      await $api('/api/apps/expense/settings', {
        method: 'POST',
        body: { savedAddressees: [...savedAddressees.value, addressee] },
      })
    }
    await $api('/api/apps/expense/expenses', {
      method: 'POST',
      body: {
        date: ocrResult.value.date,
        type: 'shinkansen',
        from: ocrResult.value.from,
        to: ocrResult.value.to,
        amount: ocrResult.value.amount,
        direction: 'one-way',
        addressee,
        notes: ocrResult.value.trainName || ocrResult.value.notes || null,
        projectName: ocrProjectName.value || null,
        payee: ocrPayee.value || null,
        hasReceipt: ocrHasReceipt.value,
      },
    })
    navigateTo('/apps/expense')
  } catch (err: any) {
    saveError.value = err?.data?.message || '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

// --- Routes ---
async function saveRoute() {
  if (!selectedRoute.value) return
  saving.value = true; saveError.value = ''
  try {
    await $api('/api/apps/expense/expenses', {
      method: 'POST',
      body: {
        date: routeDate.value,
        type: selectedRoute.value.type,
        from: selectedRoute.value.from,
        to: selectedRoute.value.to,
        amount: selectedRoute.value.amount,
        direction: routeDirection.value,
        projectName: selectedRoute.value.projectName || null,
        payee: selectedRoute.value.payee || null,
        hasReceipt: selectedRoute.value.hasReceipt ?? false,
      },
    })
    navigateTo('/apps/expense')
  } catch (err: any) {
    saveError.value = err?.data?.message || '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

// --- Manual ---
async function saveManual() {
  if (!manualFrom.value || !manualTo.value || !manualAmount.value) {
    saveError.value = '出発地・到着地・金額を入力してください'; return
  }
  saving.value = true; saveError.value = ''
  try {
    await $api('/api/apps/expense/expenses', {
      method: 'POST',
      body: {
        date: manualDate.value,
        type: manualType.value,
        from: manualFrom.value,
        to: manualTo.value,
        amount: Number(manualAmount.value),
        direction: manualDirection.value,
        addressee: manualAddressee.value || null,
        notes: manualNotes.value || null,
        projectName: manualProjectName.value || null,
        payee: manualPayee.value || null,
        hasReceipt: manualHasReceipt.value,
      },
    })
    navigateTo('/apps/expense')
  } catch (err: any) {
    saveError.value = err?.data?.message || '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

const TRANSPORT_OPTIONS = [
  { value: 'train', label: '電車' },
  { value: 'shinkansen', label: '新幹線' },
  { value: 'bus', label: 'バス' },
  { value: 'taxi', label: 'タクシー' },
  { value: 'other', label: 'その他' },
]
const DIRECTION_OPTIONS = [
  { value: 'outbound', label: '行き（片道）' },
  { value: 'return', label: '帰り（片道）' },
  { value: 'round', label: '往復' },
  { value: 'one-way', label: '片道' },
]
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-hidden bg-[--app-bg]">
    <AppHeader title="交通費を追加" back="/apps/expense" />

    <main class="flex-1 px-4 py-4">
      <div class="mx-auto max-w-2xl space-y-4">

        <!-- Step 1: Choose method -->
        <template v-if="tab === 'choose'">
          <p class="text-sm text-ink-500">どの方法で追加しますか？</p>

          <button class="card-tap w-full text-left" @click="tab = 'ocr'">
            <div class="flex items-center gap-4">
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                <Icon name="document_scanner" size="24" />
              </div>
              <div>
                <p class="font-semibold text-ink-800">領収書を読み取る</p>
                <p class="text-sm text-ink-400">新幹線のPDF・画像をAIで自動入力</p>
              </div>
              <Icon name="chevron_right" size="20" class="ml-auto text-ink-300" />
            </div>
          </button>

          <button class="card-tap w-full text-left" @click="tab = 'routes'">
            <div class="flex items-center gap-4">
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <Icon name="bookmark" size="24" />
              </div>
              <div>
                <p class="font-semibold text-ink-800">よく使うルートから選ぶ</p>
                <p class="text-sm text-ink-400">登録済みのルートから日付だけ選んで追加</p>
              </div>
              <Icon name="chevron_right" size="20" class="ml-auto text-ink-300" />
            </div>
          </button>

          <button class="card-tap w-full text-left" @click="tab = 'manual'">
            <div class="flex items-center gap-4">
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                <Icon name="edit_note" size="24" />
              </div>
              <div>
                <p class="font-semibold text-ink-800">手動で入力する</p>
                <p class="text-sm text-ink-400">日付・区間・金額などを自分で入力</p>
              </div>
              <Icon name="chevron_right" size="20" class="ml-auto text-ink-300" />
            </div>
          </button>
        </template>

        <!-- Step 2a: OCR -->
        <template v-else-if="tab === 'ocr'">
          <input ref="fileInput" type="file" accept="image/*,application/pdf" class="hidden" @change="onReceiptChange" />

          <div v-if="ocrLoading" class="card py-12 text-center">
            <div class="mb-3 flex justify-center text-brand">
              <Icon name="document_scanner" size="40" />
            </div>
            <p class="font-medium text-ink-700">領収書を読み取り中…</p>
            <p class="mt-1 text-sm text-ink-400">少々お待ちください</p>
          </div>

          <template v-else-if="!ocrResult">
            <div class="card py-8 text-center">
              <div class="mb-4 flex justify-center text-ink-200">
                <Icon name="receipt" size="48" />
              </div>
              <p class="mb-4 text-ink-600">新幹線の領収書（写真またはPDF）を選んでください</p>
              <button class="btn-primary" @click="pickReceipt">
                <Icon name="upload_file" size="18" />
                ファイルを選ぶ
              </button>
            </div>
            <p v-if="ocrError" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{{ ocrError }}</p>
          </template>

          <template v-else>
            <div class="card space-y-4">
              <p class="font-semibold text-ink-700">読み取った内容を確認してください</p>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-xs text-ink-400">乗車日</label>
                  <input v-model="ocrResult.date" type="date" class="field" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-ink-400">金額（円）</label>
                  <input v-model.number="ocrResult.amount" type="number" class="field" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-ink-400">出発駅</label>
                  <input v-model="ocrResult.from" type="text" class="field" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-ink-400">到着駅</label>
                  <input v-model="ocrResult.to" type="text" class="field" />
                </div>
              </div>

              <div>
                <label class="mb-1 block text-xs text-ink-400">支払先（鉄道会社）</label>
                <input v-model="ocrPayee" type="text" class="field" placeholder="例：JR東海" />
              </div>

              <div>
                <label class="mb-1 block text-xs text-ink-400">案件名</label>
                <select v-model="ocrProjectName" class="field">
                  <option value="">（未選択）</option>
                  <option v-for="p in savedProjectNames" :key="p" :value="p">{{ p }}</option>
                </select>
              </div>

              <div>
                <label class="mb-1 block text-xs text-ink-400">宛名（領収書に記載）</label>
                <select v-model="ocrAddresseeInput" class="field mb-2">
                  <option value="">選択または直接入力</option>
                  <option v-for="a in savedAddressees" :key="a" :value="a">{{ a }}</option>
                </select>
                <input v-model="ocrAddresseeInput" type="text" class="field" placeholder="宛名（例：小西祐子）" />
                <label v-if="ocrAddresseeInput && !savedAddressees.includes(ocrAddresseeInput)" class="mt-2 flex items-center gap-2 text-sm text-ink-500">
                  <input v-model="ocrSaveNewAddressee" type="checkbox" />
                  次回も使えるように保存する
                </label>
              </div>

              <label class="flex items-center gap-2 text-sm text-ink-600">
                <input v-model="ocrHasReceipt" type="checkbox" />
                領収書あり（Excelに「〇」が入ります）
              </label>

              <p v-if="saveError" class="text-sm text-red-500">{{ saveError }}</p>
              <div class="flex gap-3">
                <button class="btn-ghost flex-1" @click="ocrResult = null">撮り直す</button>
                <button class="btn-primary flex-1" :disabled="saving" @click="saveOcr">
                  {{ saving ? '保存中…' : '保存する' }}
                </button>
              </div>
            </div>
          </template>
        </template>

        <!-- Step 2b: Saved routes -->
        <template v-else-if="tab === 'routes'">
          <div v-if="routesLoading" class="py-8 text-center text-ink-400">読み込み中…</div>

          <template v-else-if="!selectedRoute">
            <div v-if="routes.length === 0" class="card py-10 text-center">
              <div class="mb-3 flex justify-center text-ink-200"><Icon name="bookmark" size="40" /></div>
              <p class="text-ink-600">よく使うルートがまだ登録されていません</p>
              <NuxtLink to="/apps/expense/settings" class="mt-3 inline-block text-sm text-brand">設定から登録する</NuxtLink>
            </div>
            <div v-else class="space-y-2">
              <p class="text-sm text-ink-500">どのルートを使いましたか？</p>
              <button v-for="r in routes" :key="r.id" class="card-tap w-full text-left" @click="selectedRoute = r">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-ink-800">{{ r.name }}</p>
                    <p class="text-sm text-ink-400">{{ r.from }} → {{ r.to }}<span v-if="r.payee"> · {{ r.payee }}</span></p>
                  </div>
                  <p class="font-semibold text-ink-700">{{ r.amount.toLocaleString() }}円</p>
                </div>
              </button>
            </div>
          </template>

          <template v-else>
            <div class="card space-y-4">
              <div>
                <p class="font-semibold text-ink-700">{{ selectedRoute.name }}</p>
                <p class="text-sm text-ink-400">{{ selectedRoute.from }} → {{ selectedRoute.to }}  {{ selectedRoute.amount.toLocaleString() }}円</p>
              </div>
              <div>
                <label class="mb-1 block text-xs text-ink-400">利用日</label>
                <input v-model="routeDate" type="date" class="field" />
              </div>
              <div>
                <label class="mb-2 block text-xs text-ink-400">方向</label>
                <div class="flex flex-wrap gap-2">
                  <button v-for="d in DIRECTION_OPTIONS" :key="d.value"
                    class="rounded-lg border px-4 py-2 text-sm font-medium transition"
                    :class="routeDirection === d.value ? 'border-brand bg-brand text-white' : 'border-ink-200 bg-white text-ink-600'"
                    @click="routeDirection = d.value as any">{{ d.label }}</button>
                </div>
              </div>
              <p v-if="saveError" class="text-sm text-red-500">{{ saveError }}</p>
              <div class="flex gap-3">
                <button class="btn-ghost flex-1" @click="selectedRoute = null">戻る</button>
                <button class="btn-primary flex-1" :disabled="saving" @click="saveRoute">{{ saving ? '保存中…' : '保存する' }}</button>
              </div>
            </div>
          </template>
        </template>

        <!-- Step 2c: Manual -->
        <template v-else-if="tab === 'manual'">
          <div class="card space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-ink-400">日付</label>
                <input v-model="manualDate" type="date" class="field" />
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-ink-400">交通手段</label>
                <select v-model="manualType" class="field">
                  <option v-for="t in TRANSPORT_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-ink-400">出発地</label>
                <input v-model="manualFrom" type="text" class="field" placeholder="例：品川" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-ink-400">到着地</label>
                <input v-model="manualTo" type="text" class="field" placeholder="例：小田原" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-ink-400">金額（円）</label>
                <input v-model="manualAmount" type="number" class="field" placeholder="例：3100" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-ink-400">方向</label>
                <select v-model="manualDirection" class="field">
                  <option v-for="d in DIRECTION_OPTIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
                </select>
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-ink-400">支払先（鉄道会社など）</label>
                <input v-model="manualPayee" type="text" class="field" placeholder="例：JR東海、東急バス株式会社" />
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-ink-400">案件名</label>
                <select v-model="manualProjectName" class="field">
                  <option value="">（未選択）</option>
                  <option v-for="p in savedProjectNames" :key="p" :value="p">{{ p }}</option>
                </select>
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-ink-400">宛名（任意）</label>
                <input v-model="manualAddressee" type="text" class="field" placeholder="新幹線の場合など" />
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-ink-400">備考（任意）</label>
                <input v-model="manualNotes" type="text" class="field" placeholder="例：○○顧客訪問" />
              </div>
              <div class="col-span-2">
                <label class="flex items-center gap-2 text-sm text-ink-600">
                  <input v-model="manualHasReceipt" type="checkbox" />
                  領収書あり（Excelに「〇」が入ります）
                </label>
              </div>
            </div>

            <p v-if="saveError" class="text-sm text-red-500">{{ saveError }}</p>
            <button class="btn-primary w-full" :disabled="saving" @click="saveManual">
              {{ saving ? '保存中…' : '保存する' }}
            </button>
          </div>
        </template>

      </div>
    </main>
  </div>
</template>
