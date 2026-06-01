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

interface Menu {
  id: string
  title: string
  imageId: string
  dishCount: number
  createdAt: string
}

const menus = ref<Menu[]>([])
const loading = ref(true)
const analyzing = ref(false)
const errorMsg = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const imageUrls = ref<Map<string, string>>(new Map())

onMounted(async () => {
  try {
    menus.value = await $api('/api/apps/kaiseki/menus')
  } catch {
    errorMsg.value = 'メニューの読み込みに失敗しました'
  } finally {
    loading.value = false
  }
})

watch(
  menus,
  async (list) => {
    const ids = list.map((m) => m.imageId).filter((id) => id && !imageUrls.value.has(id))
    await Promise.all(ids.map(ensureBlobUrl))
  },
  { deep: true },
)

const ensureBlobUrl = async (imageId: string) => {
  if (imageUrls.value.has(imageId)) return
  try {
    const blob = await $api(`/api/apps/kaiseki/image/${encodeURIComponent(imageId)}`, {
      responseType: 'blob',
    })
    imageUrls.value.set(imageId, URL.createObjectURL(blob as Blob))
  } catch {}
}

const imageSrc = (imageId?: string) => {
  if (!imageId) return ''
  return imageUrls.value.get(imageId) || ''
}

onBeforeUnmount(() => {
  for (const u of imageUrls.value.values()) URL.revokeObjectURL(u)
})

async function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  const maxDim = 1600
  const quality = 0.85
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
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', quality))
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1] || '')
    r.onerror = rej
    r.readAsDataURL(blob)
  })
  return { base64, mimeType: 'image/jpeg' }
}

const pickImage = () => fileInput.value?.click()

const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (fileInput.value) fileInput.value.value = ''

  analyzing.value = true
  errorMsg.value = ''

  try {
    const { base64, mimeType } = await compressImage(file)
    const result = await $api('/api/apps/kaiseki/analyze', {
      method: 'POST',
      body: { image: base64, mimeType },
    })
    navigateTo(`/apps/kaiseki/${result.id}`)
  } catch (e: any) {
    errorMsg.value =
      e?.data?.message || e?.statusMessage || '解析に失敗しました。もう一度お試しください。'
    analyzing.value = false
  }
}

const formatDate = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-hidden">
    <AppHeader title="懐石メニュー" back="/" />

    <main class="flex-1 px-4 py-4">
      <div class="mx-auto max-w-2xl">
        <!-- 解析中 -->
        <div v-if="analyzing" class="card py-12 text-center">
          <div class="mb-3 text-4xl">🔍</div>
          <p class="font-medium text-ink-700">お品書きを解析しています…</p>
          <p class="mt-1 text-sm text-ink-400">少々お待ちください（10〜20秒ほど）</p>
        </div>

        <template v-else>
          <button
            class="btn-primary mb-4 flex w-full items-center justify-center gap-2 py-3"
            @click="pickImage"
          >
            <Icon name="add_a_photo" size="20" />
            お品書きを取り込む
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

          <p
            v-if="errorMsg"
            class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {{ errorMsg }}
          </p>

          <div v-if="loading" class="py-10 text-center text-ink-400">読み込み中…</div>

          <div v-else-if="menus.length === 0" class="card py-12 text-center">
            <div class="mb-2 text-5xl">🍽️</div>
            <p class="font-medium text-ink-600">まだメニューがありません</p>
            <p class="mt-1 text-sm text-ink-400">お品書きの写真を取り込んでください</p>
          </div>

          <div v-else class="space-y-3">
            <NuxtLink
              v-for="menu in menus"
              :key="menu.id"
              :to="`/apps/kaiseki/${menu.id}`"
              class="card flex items-center gap-4 transition-colors hover:bg-ink-50"
            >
              <div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-ink-100">
                <img
                  v-if="imageSrc(menu.imageId)"
                  :src="imageSrc(menu.imageId)"
                  class="h-full w-full object-cover"
                  alt=""
                />
                <div v-else class="flex h-full w-full items-center justify-center text-2xl">🍽️</div>
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-ink-800">{{ menu.title }}</p>
                <p class="text-sm text-ink-400">
                  {{ menu.dishCount }}品 · {{ formatDate(menu.createdAt) }}
                </p>
              </div>
              <Icon name="chevron_right" size="20" class="flex-shrink-0 text-ink-300" />
            </NuxtLink>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>
