// Firebase Admin SDK の初期化
// Cloud Run 上では applicationDefault() が実行サービスアカウントの資格情報を
// メタデータサーバーから自動取得する。
// projectId を env から明示する(ADC の自動検出だけに頼ると一部環境で別プロジェクトに
// 繋いでしまう/audience 不一致でトークン検証が落ちることがあるため確実性を上げる)。
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId =
  process.env.NUXT_GCP_PROJECT_ID ||
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  undefined

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId })
}

export const db = getFirestore()
// undefined を弾く Firestore の挙動は罠が多いので、保存時に黙って削除する。
// (db.settings は最初の操作前に1回しか呼べないため try で守る)
try {
  db.settings({ ignoreUndefinedProperties: true })
} catch {
  // すでに設定済み(ホットリロード等)
}

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
