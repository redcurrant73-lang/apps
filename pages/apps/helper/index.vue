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
}

const messages = ref<Msg[]>([])
const input = ref('')
const sending = ref(false)
const errorMsg = ref('')
const listEl = ref<HTMLElement | null>(null)
const copiedAt = ref<number | null>(null)

const scrollDown = async () => {
  await nextTick()
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
}

const send = async () => {
  const q = input.value.trim()
  if (!q || sending.value) return
  messages.value.push({ role: 'user', text: q })
  input.value = ''
  sending.value = true
  errorMsg.value = ''
  await scrollDown()
  try {
    const history = messages.value.slice(0, -1).map((m) => ({ role: m.role, text: m.text }))
    const res = await $api('/api/apps/helper/chat', { method: 'POST', body: { question: q, history } })
    messages.value.push({ role: 'assistant', text: res.answer })
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.statusMessage || e?.data?.statusMessage || 'うまく答えられませんでした'
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
</script>

<template>
  <div class="flex h-screen flex-col">
    <AppHeader title="ヘルパー" back="/" />

    <main ref="listEl" class="flex-1 overflow-y-auto px-4 py-4">
      <div class="mx-auto max-w-2xl space-y-3">
        <div v-if="messages.length === 0" class="card text-center text-slate-500">
          <div class="mb-1 text-3xl">💬</div>
          アプリの使い方を聞いたり、「新しいアプリを作りたい」と相談できます。
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
            {{ m.text }}
            <button
              v-if="m.role === 'assistant'"
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

    <div class="border-t border-slate-200 bg-white px-4 py-3">
      <form class="mx-auto flex max-w-2xl items-end gap-2" @submit.prevent="send">
        <textarea
          v-model="input"
          rows="1"
          placeholder="メッセージを入力…"
          class="max-h-32 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          @keydown.enter.exact.prevent="send"
        />
        <button class="btn-primary shrink-0" :disabled="sending || !input.trim()">送信</button>
      </form>
    </div>
  </div>
</template>
