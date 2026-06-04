import { db } from '~/server/utils/firestore'
import { getKaisekiOwnerUid } from '../_ownerUid'
import { getGemini } from '~/server/utils/gemini'
import { recordGeminiUsage } from '~/server/utils/billing'

export default defineEventHandler(async (event) => {
  await requireAppAccess(event, 'kaiseki')
  const id = getRouterParam(event, 'id') || ''

  if (!id) throw createError({ statusCode: 400, message: '不正なIDです' })

  const body = await readBody(event)
  const ownerUid = await getKaisekiOwnerUid()
  const docRef = db.doc(`apps/kaiseki/users/${ownerUid}/menus/${id}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    throw createError({ statusCode: 404, message: 'メニューが見つかりません' })
  }

  // カテゴリー順の更新
  if (Array.isArray(body?.categoryOrder)) {
    await docRef.update({ categoryOrder: body.categoryOrder })
    return { ok: true }
  }

  // 料理情報の更新
  const { dishIndex, nameJa, reading, descriptionJa } = body ?? {}

  if (typeof dishIndex !== 'number') {
    throw createError({ statusCode: 400, message: '料理のインデックスが必要です' })
  }

  const dishes: any[] = [...(doc.data()?.dishes || [])]

  if (dishIndex < 0 || dishIndex >= dishes.length) {
    throw createError({ statusCode: 400, message: '不正な料理インデックスです' })
  }

  // 用語の更新（Geminiで英語訳も自動生成）
  if (typeof body?.termIndex === 'number') {
    const { termIndex, word, explanation } = body
    const terms = [...(dishes[dishIndex].terms || [])]
    if (termIndex < 0 || termIndex >= terms.length) {
      throw createError({ statusCode: 400, message: '不正な用語インデックスです' })
    }

    const newWord = typeof word === 'string' ? word : terms[termIndex].word
    const newReading = typeof reading === 'string' ? reading : terms[termIndex].reading
    const newExplanation = typeof explanation === 'string' ? explanation : terms[termIndex].explanation

    // Geminiで英語訳を生成
    let explanationEn = terms[termIndex].explanationEn || ''
    try {
      const r = await getGemini().chat({
        contents: [{
          role: 'user',
          parts: [{ text: `以下の日本料理の専門用語の説明を英語に翻訳してください。ファインダイニングのスタッフが外国人ゲストに説明するための、洗練された2〜3文の英語にしてください。JSONのみ返してください：\n\n{"explanationEn": "..."}\n\n用語: ${newWord}\n説明: ${newExplanation}` }],
        }],
      })
      await recordGeminiUsage(
        r.response.usageMetadata?.promptTokenCount,
        r.response.usageMetadata?.candidatesTokenCount,
      ).catch(() => {})
      const cleaned = r.response.text().replace(/```(?:json)?\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      if (typeof parsed.explanationEn === 'string') explanationEn = parsed.explanationEn
    } catch {}

    terms[termIndex] = {
      ...terms[termIndex],
      word: newWord,
      reading: newReading,
      explanation: newExplanation,
      explanationEn,
    }
    dishes[dishIndex] = { ...dishes[dishIndex], terms }
    await docRef.update({ dishes })
    return { ok: true, explanationEn }
  }

  // 料理情報の更新
  dishes[dishIndex] = {
    ...dishes[dishIndex],
    ...(typeof nameJa === 'string' ? { nameJa } : {}),
    ...(typeof reading === 'string' ? { reading } : {}),
    ...(typeof descriptionJa === 'string' ? { descriptionJa } : {}),
  }

  await docRef.update({ dishes })

  return { ok: true }
})
