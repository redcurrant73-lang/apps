// 料金・使用量の集計
//
// 注意: Cloud Run / Firestore / Storage の「実際の課金額」は Cloud Billing の
// BigQuery エクスポートを有効化しないと正確には取れない。初期スキャフォールドでは
// Firestore に貯めた apiUsage(Gemini 呼び出し回数など)を集計して返し、
// 実コストは「課金エクスポート設定後に対応」とする。
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firestore'

export interface UsageSummary {
  month: string
  geminiCalls: number
  geminiTokensIn: number
  geminiTokensOut: number
  days: { date: string; geminiCalls: number }[]
  costNote: string
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** apiUsage/{YYYY-MM-DD} を当月分集計する */
export async function getUsageSummary(): Promise<UsageSummary> {
  const ym = currentYearMonth()
  const snap = await db.collection('apiUsage').get()

  let geminiCalls = 0
  let geminiTokensIn = 0
  let geminiTokensOut = 0
  const days: { date: string; geminiCalls: number }[] = []

  snap.forEach((doc) => {
    if (!doc.id.startsWith(ym)) return
    const d = doc.data()
    geminiCalls += d.geminiCalls || 0
    geminiTokensIn += d.geminiTokensIn || 0
    geminiTokensOut += d.geminiTokensOut || 0
    days.push({ date: doc.id, geminiCalls: d.geminiCalls || 0 })
  })
  days.sort((a, b) => a.date.localeCompare(b.date))

  return {
    month: ym,
    geminiCalls,
    geminiTokensIn,
    geminiTokensOut,
    days,
    costNote: '実コスト(Cloud Run / Firestore 等)は Cloud Billing の BigQuery エクスポート設定後に表示します。',
  }
}

/** Gemini 呼び出しを 1 回ぶん記録する */
export async function recordGeminiUsage(tokensIn = 0, tokensOut = 0): Promise<void> {
  const date = new Date().toISOString().slice(0, 10)
  await db
    .collection('apiUsage')
    .doc(date)
    .set(
      {
        geminiCalls: FieldValue.increment(1),
        geminiTokensIn: FieldValue.increment(tokensIn),
        geminiTokensOut: FieldValue.increment(tokensOut),
      },
      { merge: true },
    )
}
