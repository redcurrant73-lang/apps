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
| ロール | 権限 |
|---|---|
| `owner` | システム全体管理(夫=ゆうき) |
| `superuser` | 全アプリ可・ユーザー/権限管理可(祐子) |
| `user` | 許可されたアプリのみ |

## サーバー側の関数(`server/utils/permissions.ts`)

- `requireAuth(event)` — ログイン必須。ID Token 検証して decoded を返す。
- `requireSuperuser(event)` — superuser / owner のみ通す。
- `requireAppAccess(event, appId)` — そのアプリへのアクセス権を必須化。
- `hasAppAccess(uid, appId, role?)` — アクセス可否の真偽判定。
- `getUserRole(uid)` — ロール取得。
- `appDataPath(appId, dataScope, { uid, orgId })` — データ保存パス生成。
- `ensureUserDoc(decoded)` — ログイン時のユーザー作成・ロール判定。

## ランチャー表示の判定(`readmes.ts: isVisibleToUser`)

1. `audience=public` → 常に表示
2. role が `superuser`/`owner` → 常に表示
3. `visibility=always_visible` → 表示
4. `visibility=superuser_only` → 非表示(2 で拾われない一般ユーザー)
5. `visibility=assignable` → `appAccess/{uid}_{appId}` があれば表示

## 新規アプリ実装時の鉄則

- **public 以外は必ず `requireAuth` か `requireAppAccess` を呼ぶ。**
- **per-user は必ずパスに uid を含める**(`appDataPath` を使う)。
- アクセス権の無いアプリのデータ/README を混ぜない(Helper も同様)。
