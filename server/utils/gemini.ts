// Gemini クライアント (Vertex AI 経由)。
//
// AI Studio (generativelanguage.googleapis.com) は "prepayment credit" モデルで
// 詰まることがあるので、GCP の通常 billing 直結の Vertex AI を使う。
// 認証は Cloud Run の実行 SA を Application Default Credentials として使う
// (Cloud Run のメタデータサーバから自動でトークン取得)。
//
// 必要な前提:
//   - aiplatform.googleapis.com が有効化されている
//   - 実行 SA に roles/aiplatform.user が付与されている
//   - NUXT_GCP_PROJECT_ID(プロジェクトID)が環境変数で渡っている
import { GoogleAuth } from 'google-auth-library'

let auth: GoogleAuth | null = null

export interface GenContentResponse {
  response: {
    text: () => string
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
    } | null
  }
}

export function getGemini() {
  const config = useRuntimeConfig()
  const project =
    (config as any).gcpProjectId || process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID
  const location = (config as any).vertexLocation || 'asia-northeast1'
  const model = config.geminiModel || 'gemini-2.0-flash'

  if (!project) {
    throw createError({
      statusCode: 503,
      message: 'AI機能の設定が不完全です(GCPプロジェクトID未設定)',
    })
  }

  if (!auth) {
    auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  }

  const call = async (body: any): Promise<GenContentResponse> => {
    const client = await auth!.getClient()
    const url =
      `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
      `/locations/${location}/publishers/google/models/${model}:generateContent`
    const res = await client.request<any>({ url, method: 'POST', data: body })
    const data = res.data || {}
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return {
      response: {
        text: () => text,
        usageMetadata: data.usageMetadata ?? null,
      },
    }
  }

  return {
    /**
     * 後方互換:単発プロンプト(文字列)を渡すと user 1 ターンで送信。
     */
    async generateContent(prompt: string): Promise<GenContentResponse> {
      return call({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    },
    /**
     * 履歴・画像・systemInstruction を含む本格チャット呼び出し。
     */
    async chat(args: {
      contents: Array<{ role: 'user' | 'model'; parts: Array<any> }>
      systemInstruction?: { parts: Array<{ text: string }> }
    }): Promise<GenContentResponse> {
      return call(args)
    },
  }
}
