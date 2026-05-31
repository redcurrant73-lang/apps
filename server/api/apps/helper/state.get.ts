// Helper の会話状態を読み込む(ページ初回ロード時に呼ばれる)。
// 画像実体は返さない(URL 経由で個別取得)。
import { loadState } from '~/server/utils/helper-state'

export default defineEventHandler(async (event) => {
  const decoded = await requireAuth(event)
  const state = await loadState(decoded.uid)
  return {
    messages: state.messages.map((m) => ({
      role: m.role,
      text: m.text,
      imageId: m.imageId ?? null,
      createdAt: m.createdAt,
    })),
    hasSummary: !!state.summary,
  }
})
