// 保存済み画像を本人だけに返す(認可は uid をパスに含めることで担保)。
import { readImage } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''
  // パスインジェクション対策(英数 / アンダースコア / ドット / ハイフンのみ許可)
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw createError({ statusCode: 400, message: '不正な画像IDです' })
  }
  try {
    const { buf, mimeType } = await readImage({
      appId: 'helper',
      uid: decoded.uid,
      imageId: id,
    })
    setResponseHeader(event, 'content-type', mimeType)
    setResponseHeader(event, 'cache-control', 'private, max-age=86400')
    return buf
  } catch (e: any) {
    if (e?.code === 404) throw createError({ statusCode: 404, message: '画像が見つかりません' })
    throw e
  }
})
