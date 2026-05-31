# 権限モデル

## 3軸モデル

各ミニアプリは `content/apps/{slug}.md` の frontmatter で挙動が決まる。

### audience(公開範囲)
| 値 | 意味 |
|---|---|
| `private` | 個人専用 |
| `shared` | 組織内で共有 |
| `public` | ログイン不要・誰でも |

### dataScope(データ保存単位)
| 値 | Firestore パス |
|---|---|
| `per-user` | `apps/{appId}/users/{uid}/...` |
| `per-org` | `apps/{appId}/orgs/{orgId}/...` |
| `global` | `apps/{appId}/data/...` |

### visibility(ランチャー表示)
| 値 | 意味 |
|---|---|
| `always_visible` | 全ユーザーに表示 |
| `assignable` | 個別に許可した人のみ |
| `superuser_only` | 管理者のみ |

## ロール

このシステムは **「祐子さんが所有・運営するシステム」を前提**としており、
夫(ゆうき)は技術的な裏方として GCP / GitHub を触るが、
**アプリ世界では普通のユーザー**として扱われる(プライバシー設計)。

| ロール | アプリ世界の権限 | 想定アカウント |
|---|---|---|
| `superuser` | 全アプリ自動アクセス・設定画面・ユーザー/権限管理 | 祐子(`SUPERUSER_EMAIL`) |
| `owner` | **普通のユーザーと同じ**(`appAccess` で個別付与) | ゆうき(`OWNER_EMAIL`)<br>※ラベルのみ。アプリ内特権なし |
| `user` | 許可されたアプリのみ | 招待された人 |

`owner` は「システム管理者のラベル」として保持しているが、
**アプリ層では一切特権を持たない**(全アプリ閲覧・設定アクセスは superuser だけ)。
緊急時は Firestore / GCP コンソールで直接操作する想定。

## サーバー側の関数(`server/utils/permissions.ts`)

- `requireAuth(event)` — ログイン必須。ID Token 検証して decoded を返す。
- `requireSuperuser(event)` — **superuser のみ**通す(owner も通さない)。
- `requireAppAccess(event, appId)` — そのアプリへのアクセス権を必須化。
- `hasAppAccess(uid, appId, role?)` — superuser のみ自動 true、それ以外は `appAccess` を確認。
- `getUserRole(uid)` — ロール取得。
- `appDataPath(appId, dataScope, { uid, orgId })` — データ保存パス生成。
- `ensureUserDoc(decoded)` — ログイン時のユーザー作成・ロール判定。

## ランチャー表示の判定(`readmes.ts: isVisibleToUser`)

1. `audience=public` → 常に表示
2. role が `superuser` → 常に表示
3. `visibility=always_visible` → 表示
4. `visibility=superuser_only` → 非表示
5. `visibility=assignable` → `appAccess/{uid}_{appId}` があれば表示

※ `owner` ロールはここでも特権を持たず、`user` と同じ経路で判定される。

## 新規アプリ実装時の鉄則

- **public 以外は必ず `requireAuth` か `requireAppAccess` を呼ぶ。**
- **per-user は必ずパスに uid を含める**(`appDataPath` を使う)。
- アクセス権の無いアプリのデータ/README を混ぜない(Helper も同様)。
