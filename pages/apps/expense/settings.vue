<script setup lang="ts">
const { $api } = useNuxtApp() as any
const { ready, user } = useAuth()

watch([ready, user], () => {
  if (ready.value && !user.value) navigateTo('/login')
}, { immediate: true })

// Settings
const reportEmail = ref('')
const savedAddressees = ref<string[]>([])
const hasTemplate = ref(false)
const newAddressee = ref('')
const settingsSaving = ref(false)
const settingsMsg = ref('')

// Routes
interface SavedRoute { id: string; name: string; from: string; to: string; type: string; amount: number }
const routes = ref<SavedRoute[]>([])
const showAddRoute = ref(false)
const routeName = ref('')
const routeFrom = ref('')
const routeTo = ref('')
const routeType = ref('train')
const routeAmount = ref('')
const routeSaving = ref(false)
const routeError = ref('')

// Template
const templateInput = ref<HTMLInputElement | null>(null)
const templateLoading = ref(false)
const templateMsg = ref('')

const loading = ref(true)

onMounted(async () => {
  const [settings, routeRes] = await Promise.all([
    $api('/api/apps/expense/settings').catch(() => ({})),
    $api('/api/apps/expense/routes').catch(() => []),
  ])
  reportEmail.value = settings.reportEmailTo || ''
  savedAddressees.value = settings.savedAddressees || []
  hasTemplate.value = settings.hasTemplate || false
  routes.value = routeRes
  loading.value = false
})

async function saveSettings() {
  settingsSaving.value = true
  settingsMsg.value = ''
  try {
    await $api('/api/apps/expense/settings', {
      method: 'POST',
      body: { reportEmailTo: reportEmail.value, savedAddressees: savedAddressees.value },
    })
    settingsMsg.value = '保存しました'
    setTimeout(() => { settingsMsg.value = '' }, 3000)
  } catch {
    settingsMsg.value = '保存に失敗しました'
  } finally {
    settingsSaving.value = false
  }
}

function addAddressee() {
  const v = newAddressee.value.trim()
  if (v && !savedAddressees.value.includes(v)) {
    savedAddressees.value.push(v)
    newAddressee.value = ''
  }
}
function removeAddressee(a: string) {
  savedAddressees.value = savedAddressees.value.filter((x) => x !== a)
}

async function addRoute() {
  if (!routeName.value || !routeFrom.value || !routeTo.value || !routeAmount.value) {
    routeError.value = '全ての項目を入力してください'
    return
  }
  routeSaving.value = true
  routeError.value = ''
  try {
    const res = await $api('/api/apps/expense/routes', {
      method: 'POST',
      body: { name: routeName.value, from: routeFrom.value, to: routeTo.value, type: routeType.value, amount: Number(routeAmount.value) },
    })
    routes.value.unshift({ id: res.id, name: routeName.value, from: routeFrom.value, to: routeTo.value, type: routeType.value, amount: Number(routeAmount.value) })
    routeName.value = ''; routeFrom.value = ''; routeTo.value = ''; routeAmount.value = ''
    showAddRoute.value = false
  } catch (e: any) {
    routeError.value = e?.data?.message || '保存に失敗しました'
  } finally {
    routeSaving.value = false
  }
}

async function deleteRoute(id: string) {
  if (!confirm('このルートを削除しますか？')) return
  await $api(`/api/apps/expense/routes/${id}`, { method: 'DELETE' }).catch(() => {})
  routes.value = routes.value.filter((r) => r.id !== id)
}

// Template upload
const pickTemplate = () => templateInput.value?.click()

async function onTemplateChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (templateInput.value) templateInput.value.value = ''

  templateLoading.value = true
  templateMsg.value = ''
  try {
    const base64 = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1] || '')
      r.onerror = rej
      r.readAsDataURL(file)
    })
    await $api('/api/apps/expense/template', {
      method: 'POST',
      body: { file: base64, mimeType: file.type },
    })
    hasTemplate.value = true
    templateMsg.value = 'テンプレートを登録しました'
  } catch (e: any) {
    templateMsg.value = e?.data?.message || 'テンプレートの読み込みに失敗しました'
  } finally {
    templateLoading.value = false
  }
}

const TRANSPORT_OPTIONS = [
  { value: 'train', label: '電車' },
  { value: 'shinkansen', label: '新幹線' },
  { value: 'bus', label: 'バス' },
  { value: 'taxi', label: 'タクシー' },
  { value: 'other', label: 'その他' },
]
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-hidden bg-[--app-bg]">
    <AppHeader title="交通費の設定" back="/apps/expense" />

    <main class="flex-1 px-4 py-4">
      <div class="mx-auto max-w-2xl space-y-5">

        <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

        <template v-else>

          <!-- Excel Template -->
          <div class="card space-y-3">
            <div class="flex items-center gap-2">
              <Icon name="description" size="20" class="text-brand" />
              <h2 class="font-semibold text-ink-800">会社指定のExcelテンプレート</h2>
            </div>

            <div class="flex items-center gap-3 rounded-xl bg-ink-50 px-4 py-3">
              <Icon :name="hasTemplate ? 'check_circle' : 'info'" size="20" :class="hasTemplate ? 'text-green-500' : 'text-ink-400'" />
              <span class="text-sm" :class="hasTemplate ? 'text-green-700' : 'text-ink-500'">
                {{ hasTemplate ? 'テンプレートが登録されています' : 'テンプレートはまだ登録されていません' }}
              </span>
            </div>

            <input ref="templateInput" type="file" accept=".xlsx,.xls" class="hidden" @change="onTemplateChange" />

            <button
              class="btn-ghost w-full flex items-center justify-center gap-2"
              :disabled="templateLoading"
              @click="pickTemplate"
            >
              <Icon name="upload_file" size="18" />
              <span v-if="templateLoading">読み込み中…</span>
              <span v-else>{{ hasTemplate ? 'テンプレートを更新する' : 'テンプレートを登録する' }}</span>
            </button>

            <p v-if="templateMsg" class="text-sm" :class="templateMsg.includes('失敗') ? 'text-red-500' : 'text-green-600'">
              {{ templateMsg }}
            </p>
          </div>

          <!-- Saved Routes -->
          <div class="card space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="bookmark" size="20" class="text-brand" />
                <h2 class="font-semibold text-ink-800">よく使うルート</h2>
              </div>
              <button class="btn-icon" @click="showAddRoute = !showAddRoute">
                <Icon :name="showAddRoute ? 'close' : 'add'" size="20" />
              </button>
            </div>

            <!-- Add route form -->
            <div v-if="showAddRoute" class="space-y-3 rounded-xl bg-ink-50 p-3">
              <input v-model="routeName" type="text" class="field" placeholder="ルート名（例：会社往復）" />
              <div class="grid grid-cols-2 gap-2">
                <input v-model="routeFrom" type="text" class="field" placeholder="出発地" />
                <input v-model="routeTo" type="text" class="field" placeholder="到着地" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <select v-model="routeType" class="field">
                  <option v-for="t in TRANSPORT_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
                <input v-model="routeAmount" type="number" class="field" placeholder="金額（円）" />
              </div>
              <p v-if="routeError" class="text-sm text-red-500">{{ routeError }}</p>
              <button class="btn-primary w-full" :disabled="routeSaving" @click="addRoute">
                {{ routeSaving ? '追加中…' : 'ルートを追加' }}
              </button>
            </div>

            <div v-if="routes.length === 0 && !showAddRoute" class="py-4 text-center text-sm text-ink-400">
              よく使うルートがありません
            </div>

            <div v-for="r in routes" :key="r.id" class="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2.5">
              <div class="flex-1 min-w-0">
                <p class="font-medium text-ink-800">{{ r.name }}</p>
                <p class="text-sm text-ink-400">{{ r.from }} → {{ r.to }} · {{ r.amount.toLocaleString() }}円</p>
              </div>
              <button class="btn-icon text-ink-300 hover:text-red-400" @click="deleteRoute(r.id)">
                <Icon name="delete" size="18" />
              </button>
            </div>
          </div>

          <!-- Saved Addressees -->
          <div class="card space-y-3">
            <div class="flex items-center gap-2">
              <Icon name="badge" size="20" class="text-brand" />
              <h2 class="font-semibold text-ink-800">よく使う宛名</h2>
            </div>

            <div class="flex gap-2">
              <input
                v-model="newAddressee"
                type="text"
                class="field flex-1"
                placeholder="宛名を追加（例：小西祐子）"
                @keydown.enter="addAddressee"
              />
              <button class="btn-ghost px-3" @click="addAddressee">
                <Icon name="add" size="20" />
              </button>
            </div>

            <div class="flex flex-wrap gap-2">
              <div
                v-for="a in savedAddressees"
                :key="a"
                class="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-sm text-brand"
              >
                <span>{{ a }}</span>
                <button class="ml-1 text-brand/60 hover:text-brand" @click="removeAddressee(a)">
                  <Icon name="close" size="14" />
                </button>
              </div>
              <p v-if="savedAddressees.length === 0" class="text-sm text-ink-400">まだありません</p>
            </div>
          </div>

          <!-- Report email -->
          <div class="card space-y-3">
            <div class="flex items-center gap-2">
              <Icon name="mail" size="20" class="text-brand" />
              <h2 class="font-semibold text-ink-800">報告書の送信先メール</h2>
            </div>
            <input
              v-model="reportEmail"
              type="email"
              class="field"
              placeholder="example@company.com"
            />
            <p class="text-xs text-ink-400">報告書ダウンロード時に参考表示されます</p>
          </div>

          <p v-if="settingsMsg" class="rounded-xl px-4 py-2 text-center text-sm" :class="settingsMsg.includes('失敗') ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'">
            {{ settingsMsg }}
          </p>

          <button class="btn-primary w-full" :disabled="settingsSaving" @click="saveSettings">
            {{ settingsSaving ? '保存中…' : '設定を保存する' }}
          </button>

        </template>
      </div>
    </main>
  </div>
</template>
