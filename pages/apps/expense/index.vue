<script setup lang="ts">
const { $api } = useNuxtApp() as any
const { ready, user } = useAuth()

watch([ready, user], () => {
  if (ready.value && !user.value) navigateTo('/login')
}, { immediate: true })

interface Expense {
  id: string
  date: string
  type: string
  from: string
  to: string
  amount: number
  direction: string
  addressee?: string
  notes?: string
  receiptImageId?: string
}

const now = new Date()
const currentYear = ref(now.getFullYear())
const currentMonth = ref(now.getMonth() + 1)
const expenses = ref<Expense[]>([])
const loading = ref(true)
const exporting = ref(false)
const errorMsg = ref('')
const exportError = ref('')

const monthStr = computed(() =>
  `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}`
)

const totalAmount = computed(() =>
  expenses.value.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
)

const groupedExpenses = computed(() => {
  const groups = new Map<string, Expense[]>()
  for (const e of expenses.value) {
    const list = groups.get(e.date) || []
    list.push(e)
    groups.set(e.date, list)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
})

async function loadExpenses() {
  loading.value = true
  errorMsg.value = ''
  try {
    expenses.value = await $api(`/api/apps/expense/expenses?month=${monthStr.value}`)
  } catch {
    errorMsg.value = '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}

onMounted(loadExpenses)
watch(monthStr, loadExpenses)

function prevMonth() {
  if (currentMonth.value === 1) { currentYear.value--; currentMonth.value = 12 }
  else currentMonth.value--
}
function nextMonth() {
  const y = new Date().getFullYear(), mo = new Date().getMonth() + 1
  if (currentYear.value === y && currentMonth.value === mo) return
  if (currentMonth.value === 12) { currentYear.value++; currentMonth.value = 1 }
  else currentMonth.value++
}
const isCurrentMonth = computed(() => {
  const n = new Date()
  return currentYear.value === n.getFullYear() && currentMonth.value === n.getMonth() + 1
})

async function deleteExpense(id: string) {
  if (!confirm('この記録を削除しますか？')) return
  try {
    await $api(`/api/apps/expense/expenses/${id}`, { method: 'DELETE' })
    expenses.value = expenses.value.filter((e) => e.id !== id)
  } catch {
    alert('削除できませんでした')
  }
}

async function exportExcel() {
  exporting.value = true
  exportError.value = ''
  try {
    const res = await $api('/api/apps/expense/export', {
      method: 'POST',
      body: { month: monthStr.value },
    })
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const file = new File([blob], res.filename, { type: blob.type })

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: res.filename })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch (e: any) {
    exportError.value = e?.data?.message || 'ファイルの作成に失敗しました'
  } finally {
    exporting.value = false
  }
}

const TRANSPORT_ICONS: Record<string, string> = {
  shinkansen: 'train',
  train: 'directions_transit',
  bus: 'directions_bus',
  taxi: 'local_taxi',
  other: 'directions_walk',
}
const DIRECTION_LABELS: Record<string, string> = {
  outbound: '行き',
  return: '帰り',
  round: '往復',
  'one-way': '片道',
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
}
function formatAmount(n: number) {
  return n.toLocaleString('ja-JP') + '円'
}
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-hidden bg-[--app-bg]">
    <AppHeader title="交通費報告" back="/" />

    <main class="flex-1 px-4 py-4">
      <div class="mx-auto max-w-2xl space-y-4">

        <!-- Month selector -->
        <div class="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-ink-100">
          <button class="btn-icon" @click="prevMonth">
            <Icon name="chevron_left" size="24" />
          </button>
          <span class="text-base font-semibold text-ink-800">
            {{ currentYear }}年{{ currentMonth }}月
          </span>
          <button class="btn-icon" :disabled="isCurrentMonth" @click="nextMonth">
            <Icon name="chevron_right" size="24" :class="isCurrentMonth ? 'text-ink-200' : ''" />
          </button>
        </div>

        <!-- Total -->
        <div class="card">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-ink-400">今月の合計</p>
              <p class="mt-0.5 text-2xl font-bold text-ink-800">{{ formatAmount(totalAmount) }}</p>
              <p class="mt-0.5 text-sm text-ink-400">{{ expenses.length }}件</p>
            </div>
            <button
              class="btn-primary flex items-center gap-2"
              :disabled="exporting || expenses.length === 0"
              @click="exportExcel"
            >
              <Icon v-if="!exporting" name="download" size="18" />
              <span v-if="exporting">作成中…</span>
              <span v-else>報告書を作る</span>
            </button>
          </div>
          <p v-if="exportError" class="mt-2 text-sm text-red-500">{{ exportError }}</p>
        </div>

        <p v-if="errorMsg" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {{ errorMsg }}
        </p>

        <!-- Loading -->
        <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

        <!-- Empty state -->
        <div v-else-if="expenses.length === 0 && !errorMsg" class="card py-12 text-center">
          <div class="mb-3 flex justify-center text-ink-200">
            <Icon name="receipt_long" size="48" />
          </div>
          <p class="font-medium text-ink-600">この月の記録はありません</p>
          <p class="mt-1 text-sm text-ink-400">下の「追加」ボタンから記録できます</p>
        </div>

        <!-- Expense list grouped by date -->
        <div v-else class="space-y-4">
          <div v-for="([date, items]) in groupedExpenses" :key="date">
            <p class="mb-2 text-sm font-medium text-ink-500">{{ formatDate(date) }}</p>
            <div class="space-y-2">
              <div
                v-for="exp in items"
                :key="exp.id"
                class="card flex items-center gap-3"
              >
                <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <Icon :name="TRANSPORT_ICONS[exp.type] || 'directions_transit'" size="20" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-ink-800">{{ exp.from }} → {{ exp.to }}</p>
                  <p class="text-sm text-ink-400">
                    {{ DIRECTION_LABELS[exp.direction] || exp.direction }}
                    <span v-if="exp.addressee"> · {{ exp.addressee }}</span>
                    <span v-if="exp.notes"> · {{ exp.notes }}</span>
                  </p>
                </div>
                <div class="flex-shrink-0 text-right">
                  <p class="font-semibold text-ink-800">{{ formatAmount(exp.amount) }}</p>
                  <button
                    class="mt-1 text-xs text-ink-300 hover:text-red-400"
                    @click="deleteExpense(exp.id)"
                  >
                    <Icon name="delete" size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>

    <!-- FAB: Add expense -->
    <div class="fixed bottom-6 right-6 flex flex-col items-end gap-3">
      <NuxtLink
        to="/apps/expense/settings"
        class="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-ink-100 text-ink-400"
      >
        <Icon name="settings" size="20" />
      </NuxtLink>
      <NuxtLink
        to="/apps/expense/add"
        class="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg"
      >
        <Icon name="add" size="28" />
      </NuxtLink>
    </div>
  </div>
</template>
