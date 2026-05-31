// Helper の会話状態(履歴 + 要約)を Firestore に保存・読み込み・圧縮する。
//
// 設計:
//   - 1ユーザー1ドキュメント (apps/helper/users/{uid}) に持つ
//   - 直近 20 ターン超過分は Gemini で「要約」に折り畳む
//   - 画像は messages[i].imageId に保存パスのキーだけを記録
//     (実体は Cloud Storage 側 / storage.ts 経由で読み書き)
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firestore'
import { getGemini } from './gemini'
import { deleteImage } from './storage'

export interface HelperMessage {
  role: 'user' | 'assistant'
  text: string
  imageId?: string
  createdAt: number // epoch ms
}

export interface HelperState {
  messages: HelperMessage[]
  summary: string
  updatedAt?: number
}

const APP_ID = 'helper'
const KEEP = 20 // 直近 KEEP ターン分を生のまま保持。超過分は要約に折り畳む。

const ref = (uid: string) => db.collection('apps').doc(APP_ID).collection('users').doc(uid)

export async function loadState(uid: string): Promise<HelperState> {
  const snap = await ref(uid).get()
  const data = snap.data() || {}
  return {
    messages: Array.isArray(data.messages) ? (data.messages as HelperMessage[]) : [],
    summary: typeof data.summary === 'string' ? data.summary : '',
  }
}

export async function saveState(uid: string, state: HelperState): Promise<void> {
  await ref(uid).set(
    {
      messages: state.messages,
      summary: state.summary,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

/** 必要なら要約に折り畳む。20ターン以下なら何もしない。 */
export async function compressIfNeeded(uid: string, state: HelperState): Promise<HelperState> {
  if (state.messages.length <= KEEP) return state

  const overflow = state.messages.slice(0, state.messages.length - KEEP)
  const kept = state.messages.slice(-KEEP)

  const lines = overflow
    .map((m) => {
      const who = m.role === 'user' ? 'ユーザー' : 'ヘルパー'
      const tag = m.imageId ? '[画像あり] ' : ''
      return `${who}: ${tag}${m.text}`
    })
    .join('\n')

  const prompt = [
    'あなたは会話の記録係です。',
    '以下は「これまでの要約」と「最近の会話」です。両方を合わせて、',
    'ユーザーが将来の会話で参照できるよう **簡潔な日本語で1段落〜数段落** にまとめてください。',
    '- 事実・好み・約束した内容・継続中のタスク は残す。',
    '- 雑談やあいさつは省く。',
    '- 出力は要約文だけ(前置きやメタ説明は書かない)。',
    '',
    '# これまでの要約(無ければ空)',
    state.summary || '(空)',
    '',
    '# 新しく折り畳む会話',
    lines,
  ].join('\n')

  try {
    const r = await getGemini().generateContent(prompt)
    const newSummary = r.response.text().trim()
    // 画像実体は要約に折り畳んだ時点で不要なので消してストレージ代を節約
    await Promise.all(
      overflow
        .filter((m) => m.imageId)
        .map((m) => deleteImage({ appId: APP_ID, uid, imageId: m.imageId! }).catch(() => {})),
    )
    return { messages: kept, summary: newSummary }
  } catch {
    // 要約に失敗しても会話自体は止めない。次のターンで再試行。
    return state
  }
}
