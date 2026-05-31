<script setup lang="ts">
const { $api } = useNuxtApp() as any
const { ready, user } = useAuth()

watch(
  [ready, user],
  () => {
    if (ready.value && !user.value) navigateTo('/login')
  },
  { immediate: true },
)

interface Msg {
  role: 'user' | 'assistant'
  text: string
  imageId?: string | null
}

const messages = ref<Msg[]>([])
const input = ref('')
const sending = ref(false)
const errorMsg = ref('')
const listEl = ref<HTMLElement | null>(null)
const copiedAt = ref<number | null>(null)
const initialLoading = ref(true)

// ---- 添付画像(クライアントで圧縮してから送る)----
const fileInput = ref<HTMLInputElement | null>(null)
const pendingImage = ref<{ base64: string; previewUrl: string; mimeType: string } | null>(null)

const scrollDown = async () => {
  await nextTick()
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
}

// ページ初回ロード: 過去の履歴を取得
onMounted(async () => {
  try {
    const res = await $api('/api/apps/helper/state')
    messages.value = res.messages || []
    await scrollDown()
  } catch {
    // 履歴が無くてもチャット自体は使える
  } finally {
    initialLoading.value = false
  }
})

// canvas で画像をリサイズ → JPEG 圧縮(端末写真の数MB → 数百KBに)
async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<{ blob: Blob; mimeType: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob>((res) => {
    canvas.toBlob((b) => res(b!), 'image/jpeg', quality)
  })
  return { blob, mimeType: 'image/jpeg' }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => {
      const v = (r.result as string).split(',')[1] || ''
      res(v)
    }
    r.onerror = rej
    r.readAsDataURL(blob)
  })
}

const pickImage = () => fileInput.value?.click()

const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const { blob, mimeType } = await compressImage(file)
    const base64 = await blobToBase64(blob)
    pendingImage.value = { base64, previewUrl: URL.createObjectURL(blob), mimeType }
  } catch {
    errorMsg.value = '画像を読み込めませんでした'
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

const clearImage = () => {
  if (pendingImage.value) URL.revokeObjectURL(pendingImage.value.previewUrl)
  pendingImage.value = null
}

const send = async () => {
  const q = input.value.trim()
  const hasImage = !!pendingImage.value
  if ((!q && !hasImage) || sending.value) return

  // 楽観表示:画像があればローカルプレビューを assistant 受信まで一時的に
  const optimisticImageUrl = pendingImage.value?.previewUrl
  messages.value.push({ role: 'user', text: q, imageId: optimisticImageUrl as any })
  input.value = ''
  sending.value = true
  errorMsg.value = ''
  await scrollDown()

  try {
    const payload: any = { question: q }
    if (pendingImage.value) {
      payload.image = {
        base64: pendingImage.value.base64,
        mimeType: pendingImage.value.mimeType,
      }
    }
    const res = await $api('/api/apps/helper/chat', { method: 'POST', body: payload })
    // 直前の楽観メッセージを実IDで置換
    if (res.imageId) {
      const last = [...messages.value].reverse().find((m) => m.role === 'user')
      if (last) last.imageId = res.imageId
    }
    messages.value.push({ role: 'assistant', text: res.answer })
    clearImage()
  } catch (e: any) {
    errorMsg.value =
      e?.data?.message || e?.statusMessage || e?.data?.statusMessage || 'うまく答えられませんでした'
    // 失敗したら楽観追加を取り消す(画像URLは復元)
    messages.value.pop()
  } finally {
    sending.value = false
    await scrollDown()
  }
}

const copy = async (text: string, idx: number) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedAt.value = idx
    setTimeout(() => (copiedAt.value = null), 1500)
  } catch {
    // noop
  }
}

// 画像表示用 URL(保存済みは /api 経由、楽観はそのまま blob: URL)
const imageSrc = (val?: string | null) => {
  if (!val) return ''
  if (val.startsWith('blob:')) return val
  return `/api/apps/helper/image/${encodeURIComponent(val)}`
}
</script>

<template>
  <!--
    iOS Safari のツールバー / ホームバーと入力欄が被らないように:
    - h-dvh : ツールバーが見えてる時は viewport がその分縮む(dynamic viewport)
    - 入力バーの pb : safe-area-inset-bottom 分の余白を確保
  -->
  <div class="flex h-dvh flex-col">
    <AppHeader title="ヘルパー" back="/" />

    <main ref="listEl" class="flex-1 overflow-y-auto px-4 py-4">
      <div class="mx-auto max-w-2xl space-y-3">
        <div v-if="initialLoading" class="text-center text-slate-400">読み込み中…</div>

        <div
          v-else-if="messages.length === 0"
          class="card text-center text-slate-500"
        >
          <div class="mb-1 text-3xl">💬</div>
          アプリの使い方を聞いたり、「新しいアプリを作りたい」と相談できます。<br />
          写真も送れます(📎ボタン)。
        </div>

        <div
          v-for="(m, i) in messages"
          :key="i"
          class="flex"
          :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm"
            :class="
              m.role === 'user'
                ? 'bg-brand text-white'
                : 'bg-white text-slate-800 ring-1 ring-slate-200'
            "
          >
            <img
              v-if="m.imageId"
              :src="imageSrc(m.imageId)"
              class="mb-2 max-h-64 rounded-xl"
              alt=""
            />
            <div v-if="m.text">{{ m.text }}</div>
            <button
              v-if="m.role === 'assistant' && m.text"
              class="mt-2 block text-xs text-slate-400 hover:text-slate-600"
              @click="copy(m.text, i)"
            >
              {{ copiedAt === i ? 'コピーしました' : 'コピー' }}
            </button>
          </div>
        </div>

        <div v-if="sending" class="text-sm text-slate-400">考えています…</div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
      </div>
    </main>

    <div
      class="border-t border-slate-200 bg-white px-4 py-3"
      style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
      <div v-if="pendingImage" class="mx-auto mb-2 flex max-w-2xl items-center gap-2">
        <img :src="pendingImage.previewUrl" class="h-16 w-16 rounded-lg object-cover" alt="" />
        <span class="flex-1 text-xs text-slate-500">画像を1枚送信予定</span>
        <button class="text-xs text-slate-400 hover:text-slate-600" @click="clearImage">
          取り消す
        </button>
      </div>

      <form class="mx-auto flex max-w-2xl items-end gap-2" @submit.prevent="send">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFileChange"
        />
        <button
          type="button"
          class="rounded-xl px-3 py-2 text-lg hover:bg-slate-100"
          aria-label="画像を添付"
          :disabled="sending"
          @click="pickImage"
        >
          📎
        </button>
        <textarea
          v-model="input"
          rows="1"
          placeholder="メッセージを入力…"
          class="max-h-32 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          @keydown.enter.exact.prevent="send"
        />
        <button
          class="btn-primary shrink-0"
          :disabled="sending || (!input.trim() && !pendingImage)"
        >
          送信
        </button>
      </form>
    </div>
  </div>
</template>
