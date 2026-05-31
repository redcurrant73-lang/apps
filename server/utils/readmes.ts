// ミニアプリの定義は content/apps/{slug}.md の frontmatter が「正」。
// 別レジストリは持たず、このファイル群を読んでアプリ一覧・権限・AIコンテキストを作る。
//
// .md は scripts/build-readmes.mjs が prebuild/predev で TS にインライン化する
// (Nitro の serverAssets 経由は @nuxt/content と衝突するため避ける)。
import matter from 'gray-matter'
import { getUserRole, hasAppAccess, type Role, type DataScope } from './permissions'
import { RAW_README_FILES } from './_readmes-generated'

export type Audience = 'private' | 'shared' | 'public'
export type Visibility = 'always_visible' | 'assignable' | 'superuser_only'

export interface AppReadme {
  id: string
  slug: string
  title: string
  icon: string
  category?: string
  audience: Audience
  dataScope: DataScope
  visibility: Visibility
  requiredApis: string[]
  order: number
  /** frontmatter を除いた本文 (Markdown 生テキスト) */
  content: string
}

export interface AccessibleApp extends AppReadme {
  /** ランチャー導線用 */
  path: string
}

/** content/apps/*.md をすべて読み込んで frontmatter を解析する */
export async function loadAllReadmes(): Promise<AppReadme[]> {
  const out: AppReadme[] = []

  for (const { slug, raw } of RAW_README_FILES) {
    const { data, content } = matter(raw)
    out.push({
      id: data.id ?? slug,
      slug,
      title: data.title ?? slug,
      // アイコンは Material Symbols 名(https://fonts.google.com/icons)。
      // 例: 'support_agent', 'settings', 'savings', 'school'
      icon: data.icon ?? 'apps',
      category: data.category,
      audience: (data.audience as Audience) ?? 'private',
      dataScope: (data.dataScope as DataScope) ?? 'per-user',
      visibility: (data.visibility as Visibility) ?? 'assignable',
      requiredApis: Array.isArray(data.requiredApis) ? data.requiredApis : [],
      order: typeof data.order === 'number' ? data.order : 100,
      content: content.trim(),
    })
  }

  out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  return out
}

/** あるアプリがそのユーザーのランチャーに表示されるべきか */
async function isVisibleToUser(app: AppReadme, uid: string, role: Role | null): Promise<boolean> {
  if (app.audience === 'public') return true
  // superuser だけが全アプリ自動表示。owner は appAccess が必要(プライバシー設計)。
  if (role === 'superuser') return true
  switch (app.visibility) {
    case 'always_visible':
      return true
    case 'superuser_only':
      return false
    case 'assignable':
      return hasAppAccess(uid, app.id, role)
    default:
      return false
  }
}

/** ユーザーがアクセスできるアプリ一覧 (ランチャー / Helper コンテキスト用) */
export async function listAccessibleApps(uid: string): Promise<AccessibleApp[]> {
  const role = await getUserRole(uid)
  const all = await loadAllReadmes()
  const result: AccessibleApp[] = []
  for (const app of all) {
    if (await isVisibleToUser(app, uid, role)) {
      result.push({ ...app, path: `/apps/${app.slug}` })
    }
  }
  return result
}

/** Helper が Gemini に渡すための README テキスト群 */
export async function loadReadmesForUser(uid: string): Promise<AppReadme[]> {
  return listAccessibleApps(uid)
}
