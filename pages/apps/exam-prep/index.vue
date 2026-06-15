<script setup lang="ts">
// 学習対策ドリル(看護師国家試験)。ホーム / セッション / サマリ + 初回オンボーディング。
// 画面の裏側はすべて /api/apps/exam-prep/* 経由(Firestore 直アクセスはしない)。
const { $api } = useNuxtApp() as any
const { ready, user, isSuperuser } = useAuth()
const config = useRuntimeConfig()
const sha = String((config.public as any).gitSha || 'dev').slice(0, 7)

watch(
  [ready, user],
  () => {
    if (ready.value && !user.value) navigateTo('/login')
  },
  { immediate: true },
)

type View = 'home' | 'session' | 'summary'
const view = ref<View>('home')
const loading = ref(true)
const accessDenied = ref(false)
const errorMsg = ref('')

interface Me {
  domain: any
  profile: any
  onboardingNeeded: boolean
  needSegment: boolean
  needExamTarget: boolean
  stats: { byGroup: any[]; streak: number; last7: { day: string; studied: boolean }[] }
  activeSession: any
}
const me = ref<Me | null>(null)

const loadMe = async () => {
  try {
    me.value = await $api('/api/apps/exam-prep/me')
    accessDenied.value = false
  } catch (e: any) {
    const code = e?.statusCode || e?.response?.status
    if (code === 403) accessDenied.value = true
    else errorMsg.value = e?.data?.message || '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}
onMounted(loadMe)

// ---- computed ----
const segmentLabel = computed(
  () =>
    (me.value?.domain?.segments || []).find((s: any) => s.id === me.value?.profile?.segment)
      ?.label || '',
)
const examTargetLabel = computed(
  () =>
    (me.value?.domain?.examTargetOptions || []).find(
      (t: any) => t.id === me.value?.profile?.examTarget,
    )?.label || '',
)
const masteryPct = computed(() => {
  const p = me.value?.profile
  return p && p.totalAnswers ? Math.round((p.totalCorrect / p.totalAnswers) * 100) : 0
})
const sortedSegments = computed(() =>
  [...(me.value?.domain?.segments || [])].sort(
    (a, b) => (b.isRecommendedDefault ? 1 : 0) - (a.isRecommendedDefault ? 1 : 0),
  ),
)
const hasActive = computed(() => !!me.value?.activeSession && !me.value.activeSession.done)
const activeRemaining = computed(() => {
  const s = me.value?.activeSession
  return s ? Math.max(0, s.total - s.unique) : 0
})

// ---- レーダーチャート(SVG)----
const RADIUS = 78
const CX = 100
const CY = 100
const radar = computed(() => {
  const groups = me.value?.stats?.byGroup || []
  const n = groups.length
  if (n < 3) return null
  const pts = groups.map((g: any, i: number) => {
    const ang = ((-90 + (360 / n) * i) * Math.PI) / 180
    const r = (Math.max(0, Math.min(100, g.pct)) / 100) * RADIUS
    return {
      x: CX + Math.cos(ang) * r,
      y: CY + Math.sin(ang) * r,
      ax: CX + Math.cos(ang) * RADIUS,
      ay: CY + Math.sin(ang) * RADIUS,
    }
  })
  return {
    poly: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    axes: pts,
    rings: [0.25, 0.5, 0.75, 1].map((f) => RADIUS * f),
  }
})

// ---- onboarding ----
const obStep = ref(1)
const obSegment = ref<string | null>(null)
const obSaving = ref(false)
const chooseSegment = async (segId: string) => {
  obSegment.value = segId
  if (me.value?.needExamTarget) {
    obStep.value = 2
    return
  }
  await saveOnboarding(segId, null)
}
const chooseTarget = async (targetId: string) => {
  await saveOnboarding(obSegment.value!, targetId)
}
const saveOnboarding = async (segment: string, examTarget: string | null) => {
  obSaving.value = true
  try {
    const body: any = { segment }
    if (examTarget) body.examTarget = examTarget
    await $api('/api/apps/exam-prep/profile', { method: 'POST', body })
    obStep.value = 1
    await loadMe()
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '保存に失敗しました'
  } finally {
    obSaving.value = false
  }
}

// ---- session ----
const current = ref<any | null>(null)
const progress = ref<{ unique: number; total: number }>({ unique: 0, total: 10 })
const starting = ref(false)
const submitting = ref(false)
const selected = ref<string | null>(null)
const answered = ref<{
  isCorrect: boolean
  answer: string
  explanation: string
  attempts: number
  aiReason?: string
} | null>(null)
const lastDone = ref(false)
const lastNext = ref<any | null>(null)
const freeAnswer = ref('')

const startSession = async (groupId?: string) => {
  if (starting.value) return
  starting.value = true
  errorMsg.value = ''
  try {
    const res = await $api('/api/apps/exam-prep/session/start', {
      method: 'POST',
      body: groupId ? { groupId } : {},
    })
    current.value = res.session.next
    progress.value = { unique: res.session.unique, total: res.session.total }
    answered.value = null
    selected.value = null
    freeAnswer.value = ''
    view.value = 'session'
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '出題を開始できませんでした'
  } finally {
    starting.value = false
  }
}

const submit = async (userAnswer: string) => {
  if (submitting.value || answered.value || !current.value || !userAnswer) return
  selected.value = userAnswer
  submitting.value = true
  try {
    const res = await $api('/api/apps/exam-prep/session/answer', {
      method: 'POST',
      body: { questionId: current.value.questionId, userAnswer },
    })
    answered.value = {
      isCorrect: res.isCorrect,
      answer: res.answer,
      explanation: res.explanation,
      attempts: res.attempts,
      aiReason: res.aiReason,
    }
    progress.value = { unique: res.session.unique, total: res.session.total }
    lastDone.value = res.done
    lastNext.value = res.next
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '判定に失敗しました'
    selected.value = null
  } finally {
    submitting.value = false
  }
}

const next = async () => {
  if (lastDone.value) {
    await endSession()
    return
  }
  current.value = lastNext.value
  answered.value = null
  selected.value = null
  freeAnswer.value = ''
}

const summary = ref<any | null>(null)
const endSession = async () => {
  try {
    summary.value = await $api('/api/apps/exam-prep/session/end', { method: 'POST', body: {} })
    view.value = 'summary'
    loadMe()
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '集計に失敗しました'
    view.value = 'home'
  }
}

const backHome = async () => {
  view.value = 'home'
  await loadMe()
}
const quitSession = async () => {
  view.value = 'home'
  await loadMe()
}

// ---- peers ----
const peers = ref<any[] | null>(null)
const peersOpen = ref(false)
const loadPeers = async () => {
  try {
    peers.value = (await $api('/api/apps/exam-prep/peers')).peers
  } catch {
    peers.value = []
  }
}
const togglePeers = async () => {
  peersOpen.value = !peersOpen.value
  if (peersOpen.value && !peers.value) await loadPeers()
}
const toggleVisible = async () => {
  const v = !me.value?.profile?.visibleToPeers
  try {
    await $api('/api/apps/exam-prep/profile', { method: 'POST', body: { visibleToPeers: v } })
    if (me.value) me.value.profile.visibleToPeers = v
    if (peersOpen.value) await loadPeers()
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '更新に失敗しました'
  }
}

// ---- maintenance (superuser) ----
const maint = ref('')
const maintBusy = ref(false)
const runSeed = async () => {
  maintBusy.value = true
  maint.value = ''
  try {
    const r = await $api('/api/apps/exam-prep/admin/seed', { method: 'POST', body: {} })
    maint.value = `確認済み問題を ${r.added} 件追加しました(全 ${r.total} 件)`
  } catch (e: any) {
    maint.value = e?.data?.message || '失敗しました'
  } finally {
    maintBusy.value = false
  }
}
const runWipe = async () => {
  if (!confirm('AIが生成した問題をすべて消します。よろしいですか?')) return
  maintBusy.value = true
  maint.value = ''
  try {
    const r = await $api('/api/apps/exam-prep/admin/wipe', {
      method: 'POST',
      body: { source: 'generated' },
    })
    maint.value = `生成問題を ${r.deleted} 件削除しました`
  } catch (e: any) {
    maint.value = e?.data?.message || '失敗しました'
  } finally {
    maintBusy.value = false
  }
}

const optionClass = (opt: string) => {
  if (!answered.value) {
    return selected.value === opt
      ? 'ring-2 ring-brand bg-brand-50'
      : 'ring-1 ring-ink-200 bg-white hover:bg-ink-50'
  }
  if (opt === answered.value.answer) return 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-900'
  if (opt === selected.value) return 'ring-2 ring-red-400 bg-red-50 text-red-900'
  return 'ring-1 ring-ink-200 bg-white text-ink-400'
}
</script>

<template>
  <div class="relative flex min-h-dvh flex-col bg-ink-50">
    <span
      class="pointer-events-none fixed left-1 top-1 z-50 select-none"
      style="font-size: 8px; opacity: 0.22"
      >v.{{ sha }}</span
    >

    <AppHeader :title="me?.domain?.appTitle || '対策ドリル'" back="/" />

    <main class="flex-1 overflow-y-auto px-4 py-4">
      <div class="mx-auto max-w-xl space-y-4">
        <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

        <div v-else-if="accessDenied" class="card text-center text-ink-600">
          <span
            class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"
          >
            <Icon name="lock" size="28" />
          </span>
          <p>このアプリの利用がまだ許可されていません。</p>
          <p class="mt-1 text-sm text-ink-400">管理者に「アクセス権」をもらってください。</p>
        </div>

        <template v-else-if="me">
          <!-- ===== HOME ===== -->
          <template v-if="view === 'home'">
            <div class="card bg-brand text-white">
              <p class="text-sm opacity-80">{{ me.domain.examLabel }} まで</p>
              <p class="mt-1 flex items-baseline gap-2">
                <span class="text-5xl font-bold leading-none">{{
                  Math.max(0, me.domain.daysLeft)
                }}</span>
                <span class="text-lg">日</span>
              </p>
              <div
                v-if="segmentLabel"
                class="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm"
              >
                <Icon name="chevron_right" size="16" />
                <span
                  >{{ segmentLabel
                  }}<template v-if="examTargetLabel"> ・ {{ examTargetLabel }}</template></span
                >
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="card text-center">
                <p class="text-xs text-ink-400">レベル</p>
                <p class="mt-1 text-2xl font-bold text-ink-800">{{ me.profile.level }}</p>
              </div>
              <div class="card text-center">
                <p class="text-xs text-ink-400">通算習得率</p>
                <p class="mt-1 text-2xl font-bold text-ink-800">
                  {{ masteryPct }}<span class="text-sm">%</span>
                </p>
              </div>
              <div class="card text-center">
                <p class="text-xs text-ink-400">連続学習</p>
                <p class="mt-1 text-2xl font-bold text-ink-800">
                  {{ me.stats.streak }}<span class="text-sm">日</span>
                </p>
              </div>
            </div>

            <!-- 7日ストリーク -->
            <div v-if="me.stats.last7?.length" class="card flex items-center justify-between py-3">
              <span class="text-xs text-ink-400">この7日</span>
              <div class="flex items-center gap-2">
                <span
                  v-for="(d, i) in me.stats.last7"
                  :key="i"
                  class="flex h-6 w-6 items-center justify-center rounded-full text-[10px]"
                  :class="d.studied ? 'bg-brand text-white' : 'bg-ink-100 text-ink-300'"
                  :title="d.day"
                >
                  <Icon v-if="d.studied" name="check" size="14" />
                  <span v-else>·</span>
                </span>
              </div>
            </div>

            <button
              class="btn-primary w-full justify-center gap-2 py-4 text-lg"
              :disabled="starting"
              @click="startSession()"
            >
              <Icon name="quiz" size="22" />
              <span v-if="starting">問題を準備中…</span>
              <span v-else-if="hasActive">続きを解く(あと{{ activeRemaining }}問)</span>
              <span v-else>10問にチャレンジ</span>
            </button>
            <p v-if="errorMsg" class="text-center text-sm text-red-600">{{ errorMsg }}</p>

            <!-- 分野別 達成率(レーダー + バー / タップで集中セッション)-->
            <div v-if="me.stats.byGroup.length" class="card">
              <p class="mb-1 text-sm font-medium text-ink-600">分野別の達成率</p>
              <p class="mb-2 text-xs text-ink-400">バーをタップでその分野だけ10問(集中)</p>

              <svg v-if="radar" viewBox="0 0 200 200" class="mx-auto mb-3 h-52 w-52">
                <circle
                  v-for="(r, i) in radar.rings"
                  :key="'r' + i"
                  :cx="CX"
                  :cy="CY"
                  :r="r"
                  fill="none"
                  stroke="#e2e8f0"
                  stroke-width="1"
                />
                <line
                  v-for="(a, i) in radar.axes"
                  :key="'a' + i"
                  :x1="CX"
                  :y1="CY"
                  :x2="a.ax"
                  :y2="a.ay"
                  stroke="#e2e8f0"
                  stroke-width="1"
                />
                <polygon
                  :points="radar.poly"
                  fill="#0ea5e9"
                  fill-opacity="0.18"
                  stroke="#0ea5e9"
                  stroke-width="2"
                />
                <circle
                  v-for="(a, i) in radar.axes"
                  :key="'d' + i"
                  :cx="a.x"
                  :cy="a.y"
                  r="2.5"
                  fill="#0ea5e9"
                />
              </svg>

              <div class="space-y-2">
                <button
                  v-for="g in me.stats.byGroup"
                  :key="g.groupId"
                  class="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition hover:bg-ink-50 disabled:opacity-50"
                  :disabled="starting"
                  @click="startSession(g.groupId)"
                >
                  <span class="w-28 shrink-0 truncate text-xs text-ink-700">{{ g.title }}</span>
                  <span class="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span
                      class="block h-full rounded-full bg-brand"
                      :style="{ width: g.pct + '%' }"
                    ></span>
                  </span>
                  <span class="w-9 shrink-0 text-right text-xs font-medium text-ink-500"
                    >{{ g.pct }}%</span
                  >
                  <Icon name="chevron_right" size="16" class="shrink-0 text-ink-300" />
                </button>
              </div>
            </div>

            <!-- ランキング -->
            <div class="card">
              <button class="flex w-full items-center justify-between" @click="togglePeers">
                <span class="flex items-center gap-2 text-sm font-medium text-ink-700">
                  <Icon name="leaderboard" size="20" />仲間のランキング
                </span>
                <Icon :name="peersOpen ? 'expand_less' : 'expand_more'" size="20" />
              </button>
              <div v-if="peersOpen" class="mt-3 space-y-2">
                <label
                  class="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-sm"
                >
                  <span class="text-ink-600">ランキングに自分を表示する</span>
                  <input
                    type="checkbox"
                    :checked="me.profile.visibleToPeers"
                    class="h-5 w-5 accent-brand"
                    @change="toggleVisible"
                  />
                </label>
                <div v-if="peers && peers.length" class="space-y-1">
                  <div
                    v-for="(p, i) in peers"
                    :key="i"
                    class="flex items-center gap-3 px-1 py-1 text-sm"
                  >
                    <span class="w-5 text-center font-bold text-ink-400">{{ i + 1 }}</span>
                    <span class="flex-1 truncate text-ink-700">{{ p.displayName }}</span>
                    <span class="text-xs text-ink-400">Lv.{{ p.level }}</span>
                    <span class="font-medium text-ink-600">{{ p.totalCorrect }}</span>
                  </div>
                </div>
                <p v-else-if="peers" class="py-2 text-center text-sm text-ink-400">
                  まだ誰も表示していません
                </p>
              </div>
            </div>

            <!-- メンテナンス(superuser のみ)-->
            <div v-if="isSuperuser" class="card">
              <p class="mb-2 flex items-center gap-2 text-sm font-medium text-ink-600">
                <Icon name="build" size="18" />メンテナンス
              </p>
              <div class="flex flex-wrap gap-2">
                <button class="btn-ghost text-sm" :disabled="maintBusy" @click="runSeed">
                  確認済み問題を補充
                </button>
                <button class="btn-ghost text-sm" :disabled="maintBusy" @click="runWipe">
                  生成問題をリセット
                </button>
              </div>
              <p v-if="maint" class="mt-2 text-xs text-ink-500">{{ maint }}</p>
            </div>
          </template>

          <!-- ===== SESSION ===== -->
          <template v-else-if="view === 'session' && current">
            <div class="flex items-center gap-3">
              <button class="btn-icon" aria-label="やめる" @click="quitSession">
                <Icon name="close" size="22" />
              </button>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
                <div
                  class="h-full rounded-full bg-brand transition-all"
                  :style="{ width: (progress.total ? (progress.unique / progress.total) * 100 : 0) + '%' }"
                ></div>
              </div>
              <span class="text-sm font-medium text-ink-500"
                >{{ progress.unique }}/{{ progress.total }}</span
              >
            </div>

            <div class="card">
              <span
                class="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600"
                >{{ current.groupTitle }}</span
              >
              <p class="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-800">
                {{ current.question }}
              </p>
            </div>

            <div v-if="current.type === 'choice'" class="space-y-2">
              <button
                v-for="(opt, i) in current.options"
                :key="i"
                class="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left text-base transition"
                :class="optionClass(opt)"
                :disabled="!!answered || submitting"
                @click="submit(opt)"
              >
                <span
                  class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-500"
                  >{{ i + 1 }}</span
                >
                <span class="flex-1">{{ opt }}</span>
                <Icon
                  v-if="answered && opt === answered.answer"
                  name="check_circle"
                  size="20"
                  class="text-emerald-600"
                />
                <Icon
                  v-else-if="answered && opt === selected"
                  name="cancel"
                  size="20"
                  class="text-red-500"
                />
              </button>
            </div>

            <div v-else class="space-y-2">
              <p class="text-xs text-ink-400">用語を入力して回答(言い換えも正解になります)</p>
              <textarea
                v-model="freeAnswer"
                rows="2"
                placeholder="答えを入力…"
                class="field w-full"
                :disabled="!!answered"
              ></textarea>
              <button
                class="btn-primary w-full justify-center"
                :disabled="!!answered || submitting || !freeAnswer.trim()"
                @click="submit(freeAnswer)"
              >
                {{ submitting ? '採点中…' : '回答する' }}
              </button>
            </div>

            <div
              v-if="answered"
              class="card"
              :class="answered.isCorrect ? 'ring-1 ring-emerald-200' : 'ring-1 ring-red-200'"
            >
              <p
                class="flex items-center gap-2 font-bold"
                :class="answered.isCorrect ? 'text-emerald-600' : 'text-red-500'"
              >
                <Icon :name="answered.isCorrect ? 'check_circle' : 'cancel'" size="20" />
                {{ answered.isCorrect ? '正解' : '不正解' }}
                <span v-if="!answered.isCorrect" class="text-sm font-normal text-ink-500"
                  >— あとでもう一度出ます</span
                >
              </p>
              <p v-if="current.type !== 'choice'" class="mt-2 text-sm text-ink-600">
                正解: <span class="font-medium text-ink-800">{{ answered.answer }}</span>
              </p>
              <p v-if="answered.aiReason" class="mt-1 text-xs text-ink-400">
                {{ answered.aiReason }}
              </p>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                {{ answered.explanation }}
              </p>
              <button class="btn-primary mt-3 w-full justify-center gap-1" @click="next">
                <span>{{ lastDone ? '結果を見る' : '次へ' }}</span>
                <Icon name="arrow_forward" size="18" />
              </button>
            </div>
            <p v-if="errorMsg" class="text-center text-sm text-red-600">{{ errorMsg }}</p>
          </template>

          <!-- ===== SUMMARY ===== -->
          <template v-else-if="view === 'summary' && summary">
            <div class="card text-center">
              <span
                class="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
                :class="summary.delta > 0 ? 'levelup' : ''"
              >
                <Icon name="emoji_events" size="32" />
              </span>
              <p class="text-lg font-bold text-ink-800">10問クリア!</p>
              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="rounded-xl bg-ink-50 p-3">
                  <p class="text-xs text-ink-400">正答率</p>
                  <p class="mt-1 text-2xl font-bold text-ink-800">{{ summary.accuracy }}%</p>
                </div>
                <div class="rounded-xl bg-ink-50 p-3">
                  <p class="text-xs text-ink-400">やり直し</p>
                  <p class="mt-1 text-2xl font-bold text-ink-800">{{ summary.retries }}回</p>
                </div>
              </div>
              <div class="mt-4 flex items-center justify-center gap-2">
                <span class="text-sm text-ink-500">レベル</span>
                <span class="text-xl font-bold text-ink-700">{{ summary.oldLevel }}</span>
                <Icon name="arrow_forward" size="18" class="text-ink-400" />
                <span
                  class="text-2xl font-bold"
                  :class="[
                    summary.delta > 0
                      ? 'text-emerald-600 levelup'
                      : summary.delta < 0
                        ? 'text-red-500'
                        : 'text-ink-700',
                  ]"
                  >{{ summary.newLevel }}</span
                >
                <span v-if="summary.delta > 0" class="text-sm font-medium text-emerald-600"
                  >アップ!</span
                >
                <span v-else-if="summary.delta < 0" class="text-sm text-red-500">ダウン</span>
              </div>
            </div>
            <button
              class="btn-primary w-full justify-center gap-2 py-4"
              :disabled="starting"
              @click="startSession()"
            >
              <Icon name="replay" size="20" />もう10問
            </button>
            <button class="btn-ghost w-full justify-center" @click="backHome">ホームへ</button>
          </template>
        </template>
      </div>
    </main>

    <!-- ===== ONBOARDING ===== -->
    <div
      v-if="me && me.onboardingNeeded && !accessDenied"
      class="fixed inset-0 z-40 flex flex-col bg-white"
    >
      <div class="flex-1 overflow-y-auto px-5 py-8">
        <div class="mx-auto max-w-md">
          <template v-if="obStep === 1">
            <p class="text-xs font-medium uppercase tracking-wide text-brand-600">STEP 1</p>
            <h2 class="mt-1 text-xl font-bold text-ink-800">あなたの現場を選んでください</h2>
            <p class="mt-1 text-sm text-ink-500">
              現場に合わせて出題のバランスを調整します。あとで変えられます。
            </p>
            <div class="mt-5 space-y-3">
              <button
                v-for="s in sortedSegments"
                :key="s.id"
                class="card card-tap w-full text-left"
                :disabled="obSaving"
                @click="chooseSegment(s.id)"
              >
                <p class="flex items-center gap-2 font-bold text-ink-800">
                  {{ s.label }}
                  <span
                    v-if="s.isRecommendedDefault"
                    class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600"
                    >おすすめ</span
                  >
                </p>
                <p v-if="s.hint" class="mt-1 text-sm text-ink-500">{{ s.hint }}</p>
              </button>
            </div>
          </template>
          <template v-else>
            <button
              class="mb-3 inline-flex items-center gap-1 text-sm text-ink-500"
              @click="obStep = 1"
            >
              <Icon name="arrow_back" size="18" />現場を選び直す
            </button>
            <p class="text-xs font-medium uppercase tracking-wide text-brand-600">STEP 2</p>
            <h2 class="mt-1 text-xl font-bold text-ink-800">受験パターンを選んでください</h2>
            <div class="mt-5 space-y-3">
              <button
                v-for="t in me.domain.examTargetOptions"
                :key="t.id"
                class="card card-tap w-full text-left"
                :disabled="obSaving"
                @click="chooseTarget(t.id)"
              >
                <p class="font-bold text-ink-800">{{ t.label }}</p>
              </button>
            </div>
          </template>
          <p v-if="obSaving" class="mt-4 text-center text-sm text-ink-400">保存しています…</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes levelup-pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.35);
  }
  60% {
    transform: scale(0.92);
  }
  100% {
    transform: scale(1);
  }
}
.levelup {
  animation: levelup-pop 0.7s ease-out 1;
}
</style>
