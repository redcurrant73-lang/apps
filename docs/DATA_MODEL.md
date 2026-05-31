# データモデル(Firestore)

```
users/{uid}
  email: string
  displayName: string
  photoURL: string
  role: "owner" | "superuser" | "user"
  createdAt: Timestamp
  lastLoginAt: Timestamp
  updatedAt?: Timestamp

apps/{appId}/...                 ← 各ミニアプリ固有データ
  users/{uid}/...                ← dataScope: per-user
  orgs/{orgId}/...               ← dataScope: per-org
  data/...                       ← dataScope: global

appAccess/{uid}_{appId}          ← ユーザーごとのアプリアクセス権
  uid: string
  appId: string
  grantedBy: string              ← 付与した superuser の uid
  grantedAt: Timestamp

orgs/{orgId}                     ← 組織(ナース教育など)
  name: string
  createdAt: Timestamp

memberships/{uid}_{orgId}        ← 組織メンバーシップ
  uid: string
  orgId: string
  role: "admin" | "member"

pushSubs/{subId}                 ← Web Push 購読(subId = endpoint の base64url)
  uid: string
  endpoint: string
  keys: { p256dh: string, auth: string }
  createdAt: Timestamp

apiUsage/{YYYY-MM-DD}            ← API 使用量(料金画面で集計)
  geminiCalls: number
  geminiTokensIn: number
  geminiTokensOut: number
```

## 補足

- ミニアプリの「定義」(タイトル・アイコン・公開設定など)は Firestore ではなく
  `content/apps/{slug}.md` の frontmatter に持つ。
- `subId` は endpoint をそのまま使えないため `base64url` 変換して 256 文字に切る。
- `apiUsage` はドキュメントID を日付にして `FieldValue.increment` で加算する。
