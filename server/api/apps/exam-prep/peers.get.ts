// listPeers: ランキング表示を ON(visibleToPeers=true)にした人の上位を返す。
import { listPeers } from '~/server/utils/exam-prep/store'

export default defineEventHandler(async (event) => {
  await requireAppAccess(event, 'exam-prep')
  const peers = await listPeers(20)
  return { peers }
})
