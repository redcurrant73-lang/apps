<script setup lang="ts">
// 学習ドリル(割り当てられたクイズで勉強する)。ホーム / セッション / サマリ。
// 業種(クイズ)は superuser が割り当てる。画面の裏側はすべて /api/apps/exam-prep/* 経由。
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
  quiz: any
  profile: any
  stats: { byCategory: any[]; streak: number; last7: { day: string; studied: boolean }[] }
  activeSession: any
  switcher?: { quizzes: { id: string; title: string }[]; currentQuizId: string } | null
}
const me = ref<Me | null>(null)

const loadMe = async () => {
  try {
    me.value = await $api('/api/apps/exam-prep/me')
    accessDenied.value = false
  } catch (e: any) {
    if ((e?.statusCode || e?.response?.status) === 403) accessDenied.value = true
    else errorMsg.value = e?.data?.message || '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}
onMounted(loadMe)

// superuser:課題(クイズ)切り替え(各業種のUI確認用)
const switching = ref(false)
const switchQuiz = async (quizId: string) => {
  if (switching.value || quizId === me.value?.switcher?.currentQuizId) return
  switching.value = true
  errorMsg.value = ''
  try {
    await $api('/api/apps/exam-prep/switch', { method: 'POST', body: { quizId } })
    await loadMe()
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '切り替えに失敗しました'
  } finally {
    switching.value = false
  }
}

// superuser:この課題の問題を全部消して作り直す
const resetting = ref(false)
const resetQuestions = async () => {
  if (resetting.value) return
  if (!confirm('この課題のAI生成問題を全部消して作り直します。よろしいですか?')) return
  resetting.value = true
  errorMsg.value = ''
  try {
    const r = await $api('/api/apps/exam-prep/admin/reset-questions', { method: 'POST', body: {} })
    alert(`${r.deleted}問を削除しました。次の出題から新しく作り直されます。`)
    await loadMe()
  } catch (e: any) {
    errorMsg.value = e?.data?.message || 'リセットに失敗しました'
  } finally {
    resetting.value = false
  }
}

const masteryPct = computed(() => {
  const p = me.value?.profile
  return p && p.totalAnswers ? Math.round((p.totalCorrect / p.totalAnswers) * 100) : 0
})
const hasActive = computed(() => !!me.value?.activeSession && !me.value.activeSession.done)
const activeRemaining = computed(() => {
  const s = me.value?.activeSession
  return s ? Math.max(0, s.total - s.unique) : 0
})

// ---- レーダーチャート(カテゴリ別)----
const RADIUS = 78
const CX = 100
const CY = 100
const radar = computed(() => {
  const cats = me.value?.stats?.byCategory || []
  const n = cats.length
  if (n < 3) return null
  const pts = cats.map((c: any, i: number) => {
    const ang = ((-90 + (360 / n) * i) * Math.PI) / 180
    const r = (Math.max(0, Math.min(100, c.pct)) / 100) * RADIUS
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
const preparing = ref(false)

const fireTopup = async () => {
  try {
    const r = await $api('/api/apps/exam-prep/session/topup', { method: 'POST', body: {} })
    return r.session
  } catch {
    return null
  }
}

const startSession = async (categoryId?: string) => {
  if (starting.value) return
  starting.value = true
  errorMsg.value = ''
  try {
    const res = await $api('/api/apps/exam-prep/session/start', {
      method: 'POST',
      body: categoryId ? { categoryId } : {},
    })
    current.value = res.session.next
    progress.value = { unique: res.session.unique, total: res.session.total }
    answered.value = null
    selected.value = null
    freeAnswer.value = ''
    preparing.value = false
    view.value = 'session'
    // 残り(後追い分)を背景で生成 → 最初の数問を解く間に揃う
    if ((res.session.pending ?? 0) > 0) fireTopup()
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
  answered.value = null
  selected.value = null
  freeAnswer.value = ''
  if (lastDone.value) {
    await endSession()
    return
  }
  if (lastNext.value) {
    current.value = lastNext.value
    return
  }
  // 次がまだ生成途中(後追い)→ 準備中表示して待つ
  current.value = null
  preparing.value = true
  await ensureNext(0)
}

const ensureNext = async (tries: number) => {
  const s = await fireTopup()
  if (s?.next) {
    current.value = s.next
    progress.value = { unique: s.unique, total: s.total }
    preparing.value = false
    return
  }
  if (s && s.done) {
    preparing.value = false
    await endSession()
    return
  }
  if (tries < 6) {
    setTimeout(() => ensureNext(tries + 1), 1200)
    return
  }
  // あきらめ:今あるところで終了
  preparing.value = false
  await endSession()
}

// セッションの状態(presentSession)を受け取って次の問題へ進める
const applyNext = async (session: any) => {
  answered.value = null
  selected.value = null
  freeAnswer.value = ''
  if (!session) {
    await backHome()
    return
  }
  progress.value = { unique: session.unique, total: session.total }
  if (session.done) {
    await endSession()
    return
  }
  if (session.next) {
    current.value = session.next
    return
  }
  current.value = null
  preparing.value = true
  await ensureNext(0)
}

// superuser:出題中の低品質な問題を削除して次へ
const deleting = ref(false)
const deleteCurrent = async () => {
  if (deleting.value || !current.value) return
  deleting.value = true
  try {
    const res = await $api('/api/apps/exam-prep/admin/delete-question', {
      method: 'POST',
      body: { questionId: current.value.questionId },
    })
    await applyNext(res.session)
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '削除に失敗しました'
  } finally {
    deleting.value = false
  }
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

    <AppHeader :title="me?.quiz?.title || '学習ドリル'" back="/" />

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
            <!-- ===== 管理者メニュー(superuser のみ表示)===== -->
            <div v-if="me.switcher" class="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p class="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <Icon name="admin_panel_settings" size="16" />管理者メニュー(ほかの人には表示されません)
              </p>
              <div class="flex items-center gap-2">
                <span class="shrink-0 text-sm text-ink-700">課題を切替</span>
                <select
                  class="field ml-auto w-auto"
                  :value="me.switcher.currentQuizId"
                  :disabled="switching"
                  @change="switchQuiz(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="q in me.switcher.quizzes" :key="q.id" :value="q.id">{{ q.title }}</option>
                </select>
              </div>
              <NuxtLink
                to="/apps/exam-prep/admin"
                class="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink-700"
              >
                <span class="flex items-center gap-2"><Icon name="manage_accounts" size="18" />業種の割り当て</span>
                <Icon name="chevron_right" size="18" class="text-ink-300" />
              </NuxtLink>
              <button
                class="flex w-full items-center justify-center gap-1 rounded-xl border border-red-200 bg-white py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                :disabled="resetting"
                @click="resetQuestions"
              >
                <Icon name="delete_sweep" size="18" />この課題の問題を全部消して作り直す
              </button>
            </div>

            <!-- カウントダウン or タイトル -->
            <div class="card bg-brand text-white">
              <template v-if="me.quiz.daysLeft !== null">
                <p class="text-sm opacity-80">{{ me.quiz.title }} まで</p>
                <p class="mt-1 flex items-baseline gap-2">
                  <span class="text-5xl font-bold leading-none">{{ Math.max(0, me.quiz.daysLeft) }}</span>
                  <span class="text-lg">日</span>
                </p>
              </template>
              <template v-else>
                <p class="flex items-center gap-2 text-2xl font-bold">
                  <Icon :name="me.quiz.icon || 'school'" size="26" />{{ me.quiz.title }}
                </p>
              </template>
              <div class="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm">
                <Icon name="badge" size="16" /><span>{{ me.quiz.occupation }}</span>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="card text-center">
                <p class="text-xs text-ink-400">レベル</p>
                <p class="mt-1 text-2xl font-bold text-ink-800">{{ me.profile.level }}</p>
              </div>
              <div class="card text-center">
                <p class="text-xs text-ink-400">通算習得率</p>
                <p class="mt-1 text-2xl font-bold text-ink-800">{{ masteryPct }}<span class="text-sm">%</span></p>
              </div>
              <div class="card text-center">
                <p class="text-xs text-ink-400">連続学習</p>
                <p class="mt-1 text-2xl font-bold text-ink-800">{{ me.stats.streak }}<span class="text-sm">日</span></p>
              </div>
            </div>

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

            <div v-if="me.stats.byCategory.length" class="card">
              <p class="mb-1 text-sm font-medium text-ink-600">カテゴリ別の達成率</p>
              <p class="mb-2 text-xs text-ink-400">バーをタップでそのカテゴリだけ10問(集中)</p>

              <svg v-if="radar" viewBox="0 0 200 200" class="mx-auto mb-3 h-52 w-52">
                <circle v-for="(r, i) in radar.rings" :key="'r' + i" :cx="CX" :cy="CY" :r="r" fill="none" stroke="#e2e8f0" stroke-width="1" />
                <line v-for="(a, i) in radar.axes" :key="'a' + i" :x1="CX" :y1="CY" :x2="a.ax" :y2="a.ay" stroke="#e2e8f0" stroke-width="1" />
                <polygon :points="radar.poly" fill="#0ea5e9" fill-opacity="0.18" stroke="#0ea5e9" stroke-width="2" />
                <circle v-for="(a, i) in radar.axes" :key="'d' + i" :cx="a.x" :cy="a.y" r="2.5" fill="#0ea5e9" />
              </svg>

              <div class="space-y-2">
                <button
                  v-for="c in me.stats.byCategory"
                  :key="c.categoryId"
                  class="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition hover:bg-ink-50 disabled:opacity-50"
                  :disabled="starting"
                  @click="startSession(c.categoryId)"
                >
                  <span class="w-28 shrink-0 truncate text-xs text-ink-700">{{ c.title }}</span>
                  <span class="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span class="block h-full rounded-full bg-brand" :style="{ width: c.pct + '%' }"></span>
                  </span>
                  <span class="w-9 shrink-0 text-right text-xs font-medium text-ink-500">{{ c.pct }}%</span>
                  <Icon name="chevron_right" size="16" class="shrink-0 text-ink-300" />
                </button>
              </div>
            </div>

            <div class="card">
              <button class="flex w-full items-center justify-between" @click="togglePeers">
                <span class="flex items-center gap-2 text-sm font-medium text-ink-700">
                  <Icon name="leaderboard" size="20" />仲間のランキング
                </span>
                <Icon :name="peersOpen ? 'expand_less' : 'expand_more'" size="20" />
              </button>
              <div v-if="peersOpen" class="mt-3 space-y-2">
                <label class="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 text-sm">
                  <span class="text-ink-600">ランキングに自分を表示する</span>
                  <input type="checkbox" :checked="me.profile.visibleToPeers" class="h-5 w-5 accent-brand" @change="toggleVisible" />
                </label>
                <div v-if="peers && peers.length" class="space-y-1">
                  <div v-for="(p, i) in peers" :key="i" class="flex items-center gap-3 px-1 py-1 text-sm">
                    <span class="w-5 text-center font-bold text-ink-400">{{ i + 1 }}</span>
                    <span class="flex-1 truncate text-ink-700">{{ p.displayName }}</span>
                    <span class="text-xs text-ink-400">Lv.{{ p.level }}</span>
                    <span class="font-medium text-ink-600">{{ p.totalCorrect }}</span>
                  </div>
                </div>
                <p v-else-if="peers" class="py-2 text-center text-sm text-ink-400">まだ誰も表示していません</p>
              </div>
            </div>
          </template>

          <!-- ===== SESSION ===== -->
          <template v-else-if="view === 'session'">
            <div class="flex items-center gap-3">
              <button class="btn-icon" aria-label="やめる" @click="quitSession"><Icon name="close" size="22" /></button>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
                <div class="h-full rounded-full bg-brand transition-all" :style="{ width: (progress.total ? (progress.unique / progress.total) * 100 : 0) + '%' }"></div>
              </div>
              <span class="text-sm font-medium text-ink-500">{{ progress.unique }}/{{ progress.total }}</span>
            </div>

            <div
              v-if="!current && preparing"
              class="card flex items-center justify-center gap-2 py-10 text-ink-400"
            >
              <Icon name="hourglass_empty" size="20" />次の問題を準備中…
            </div>

            <template v-if="current">
            <div class="card">
              <div class="flex items-center justify-between gap-2">
                <span class="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">{{ current.categoryTitle }}</span>
                <button
                  v-if="isSuperuser"
                  class="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  :disabled="deleting"
                  @click="deleteCurrent"
                >
                  <Icon name="admin_panel_settings" size="14" />管理者:削除
                </button>
              </div>
              <p class="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-800">{{ current.question }}</p>
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
                <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-500">{{ i + 1 }}</span>
                <span class="flex-1">{{ opt }}</span>
                <Icon v-if="answered && opt === answered.answer" name="check_circle" size="20" class="text-emerald-600" />
                <Icon v-else-if="answered && opt === selected" name="cancel" size="20" class="text-red-500" />
              </button>
            </div>

            <div v-else class="space-y-2">
              <p class="text-xs text-ink-400">用語を入力して回答(言い換えも正解になります)</p>
              <textarea v-model="freeAnswer" rows="2" placeholder="答えを入力…" class="field w-full" :disabled="!!answered"></textarea>
              <button class="btn-primary w-full justify-center" :disabled="!!answered || submitting || !freeAnswer.trim()" @click="submit(freeAnswer)">
                {{ submitting ? '採点中…' : '回答する' }}
              </button>
            </div>

            <div v-if="answered" class="card" :class="answered.isCorrect ? 'ring-1 ring-emerald-200' : 'ring-1 ring-red-200'">
              <p class="flex items-center gap-2 font-bold" :class="answered.isCorrect ? 'text-emerald-600' : 'text-red-500'">
                <Icon :name="answered.isCorrect ? 'check_circle' : 'cancel'" size="20" />
                {{ answered.isCorrect ? '正解' : '不正解' }}
                <span v-if="!answered.isCorrect" class="text-sm font-normal text-ink-500">— あとでもう一度出ます</span>
              </p>
              <p v-if="current.type !== 'choice'" class="mt-2 text-sm text-ink-600">
                正解: <span class="font-medium text-ink-800">{{ answered.answer }}</span>
              </p>
              <p v-if="answered.aiReason" class="mt-1 text-xs text-ink-400">{{ answered.aiReason }}</p>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{{ answered.explanation }}</p>
              <button class="btn-primary mt-3 w-full justify-center gap-1" @click="next">
                <span>{{ lastDone ? '結果を見る' : '次へ' }}</span><Icon name="arrow_forward" size="18" />
              </button>
            </div>
            </template>
            <p v-if="errorMsg" class="text-center text-sm text-red-600">{{ errorMsg }}</p>
          </template>

          <!-- ===== SUMMARY ===== -->
          <template v-else-if="view === 'summary' && summary">
            <div class="card text-center">
              <span class="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600" :class="summary.delta > 0 ? 'levelup' : ''">
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
                <span class="text-2xl font-bold" :class="[summary.delta > 0 ? 'text-emerald-600 levelup' : summary.delta < 0 ? 'text-red-500' : 'text-ink-700']">{{ summary.newLevel }}</span>
                <span v-if="summary.delta > 0" class="text-sm font-medium text-emerald-600">アップ!</span>
                <span v-else-if="summary.delta < 0" class="text-sm text-red-500">ダウン</span>
              </div>
            </div>
            <button class="btn-primary w-full justify-center gap-2 py-4" :disabled="starting" @click="startSession()">
              <Icon name="replay" size="20" />もう10問
            </button>
            <button class="btn-ghost w-full justify-center" @click="backHome">ホームへ</button>
          </template>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
@keyframes levelup-pop {
  0% { transform: scale(1); }
  35% { transform: scale(1.35); }
  60% { transform: scale(0.92); }
  100% { transform: scale(1); }
}
.levelup { animation: levelup-pop 0.7s ease-out 1; }
</style>
