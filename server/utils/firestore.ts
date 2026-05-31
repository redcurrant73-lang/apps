// Firebase Admin SDK の初期化
// Cloud Run 上では applicationDefault() が実行サービスアカウントの資格情報を
// メタデータサーバーから自動取得する。ローカル開発で資格情報が無い場合でも
// 初期化自体は失敗せず、実際に Firestore へアクセスした時点でのみエラーになる。
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  try {
    initializeApp({ credential: applicationDefault() })
  } catch {
    // 資格情報が見つからない環境 (ローカル等) でもサーバー起動は止めない
    initializeApp()
  }
}

export const db = getFirestore()

// Firestore Timestamp 等をそのまま JSON 化すると壊れるので、API 応答用に整形する。
export function serializeDoc<T extends Record<string, any>>(
  id: string,
  data: T | undefined,
): (T & { id: string }) | null {
  if (!data) return null
  const out: Record<string, any> = { id }
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString()
    } else {
      out[k] = v
    }
  }
  return out as T & { id: string }
}
