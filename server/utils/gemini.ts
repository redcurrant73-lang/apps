// Gemini クライアント (Vertex AI 経由)。
//
// AI Studio (generativelanguage.googleapis.com) は "prepayment credit" モデルで
// 詰まることがあるので、GCP の通常 billing 直結の Vertex AI を使う。
// 認証は Cloud Run の実行 SA を Application Default Credentials として使う。
//
// リージョン:既定は `global`。Gemini はリージョンごとに使えるモデルが違い、
// asia-northeast1 等では新しめのモデルが無いことがある。global は対応が広く、
// ホスト名だけ特殊(global-aiplatform... ではなく aiplatform...)。
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

function endpoint(location: string, project: string, model: string): string {
  const host =
    location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`
  return (
    `https://${host}/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`
  )
}

export function getGemini() {
  const config = useRuntimeConfig()
  const project =
    (config as any).gcpProjectId || process.env.NUXT_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID
  const location = (config as any).vertexLocation || 'global'
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
    const res = await client.request<any>({
      url: endpoint(location, project, model),
      method: 'POST',
      data: body,
    })
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
    /** 後方互換:単発プロンプト(文字列)を user 1 ターンで送信。 */
    async generateContent(prompt: string): Promise<GenContentResponse> {
      return call({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
    },
    /** 履歴・画像・systemInstruction を含む本格チャット呼び出し。 */
    async chat(args: {
      contents: Array<{ role: 'user' | 'model'; parts: Array<any> }>
      systemInstruction?: { parts: Array<{ text: string }> }
    }): Promise<GenContentResponse> {
      return call(args)
    },
  }
}
