// Gemini API クライアント
// API キーは Secret Manager → 環境変数 NUXT_GEMINI_API_KEY 経由で注入される。
import { GoogleGenerativeAI } from '@google/generative-ai'

let client: GoogleGenerativeAI | null = null

export function getGemini() {
  const config = useRuntimeConfig()
  if (!config.geminiApiKey) {
    throw createError({
      statusCode: 503,
      message: 'AI機能がまだ設定されていません',
    })
  }
  if (!client) {
    client = new GoogleGenerativeAI(config.geminiApiKey)
  }
  return client.getGenerativeModel({
    model: config.geminiModel || 'gemini-1.5-flash',
  })
}
