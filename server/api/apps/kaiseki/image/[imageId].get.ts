import { readImage } from '~/server/utils/storage'
import { getKaisekiOwnerUid } from '../_ownerUid'

export default defineEventHandler(async (event) => {
  const imageId = getRouterParam(event, 'imageId') || ''

  if (!/^[A-Za-z0-9._-]+$/.test(imageId)) {
    throw createError({ statusCode: 400, message: '不正な画像IDです' })
  }

  const ownerUid = await getKaisekiOwnerUid()

  try {
    const { buf, mimeType } = await readImage({
      appId: 'kaiseki',
      uid: ownerUid,
      imageId,
    })
    setResponseHeader(event, 'content-type', mimeType)
    setResponseHeader(event, 'cache-control', 'private, max-age=86400')
    return buf
  } catch (e: any) {
    if (e?.code === 404) throw createError({ statusCode: 404, message: '画像が見つかりません' })
    throw e
  }
})
