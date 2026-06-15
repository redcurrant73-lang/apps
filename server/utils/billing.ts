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
  /** 当月の推定AI料金(円) */
  estimatedCostJpy: number
  days: { date: string; geminiCalls: number; costJpy: number }[]
  costNote: string
  /** 料金の前提(レート)説明 */
  priceNote: string
}

// Gemini 2.5 Flash の従量目安(USD / 100万トークン)。料金改定時はここを直す。
const GEMINI_INPUT_USD_PER_1M = 0.3
const GEMINI_OUTPUT_USD_PER_1M = 2.5
const USD_JPY = 155 // 為替の概算(円/$)。必要に応じて調整。

function estimateJpy(tokensIn: number, tokensOut: number): number {
  const usd =
    (tokensIn / 1_000_000) * GEMINI_INPUT_USD_PER_1M +
    (tokensOut / 1_000_000) * GEMINI_OUTPUT_USD_PER_1M
  return usd * USD_JPY
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
    days.push({
      date: doc.id,
      geminiCalls: d.geminiCalls || 0,
      costJpy: estimateJpy(d.geminiTokensIn || 0, d.geminiTokensOut || 0),
    })
  })
  days.sort((a, b) => a.date.localeCompare(b.date))

  return {
    month: ym,
    geminiCalls,
    geminiTokensIn,
    geminiTokensOut,
    estimatedCostJpy: estimateJpy(geminiTokensIn, geminiTokensOut),
    days,
    costNote: '実コスト(Cloud Run / Firestore 等)は Cloud Billing の BigQuery エクスポート設定後に表示します。',
    priceNote: `※ AI料金は Gemini 2.5 Flash の従量目安(入力 $${GEMINI_INPUT_USD_PER_1M} / 出力 $${GEMINI_OUTPUT_USD_PER_1M} per 100万トークン)を約${USD_JPY}円/$で換算した概算です。実際の請求とは差があります。`,
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
