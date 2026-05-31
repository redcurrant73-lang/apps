# apps

小西祐子さんが日常使いするミニアプリのプラットフォーム。
トップページがミニアプリのランチャーになっていて、ユーザーごとに使えるアプリが変わります。

- 認証必須(Google ログイン / Firebase Auth)
- スマホ PWA + Web Push 通知
- ミニアプリは Claude Code との会話で追加していく
- `main` に push すると GitHub Actions が Cloud Run へ自動デプロイ

## 技術スタック

Nuxt 3 (Nitro) / Firebase Auth / Firestore / Cloud Storage / Gemini / Cloud Run / Tailwind CSS / `@vite-pwa/nuxt`

## ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | Claude Code 向けの運用ルール(最重要) |
| `PROJECT_SPEC.md` | 仕様の正本 |
| `docs/ARCHITECTURE.md` | 構成と方針 |
| `docs/PERMISSIONS.md` | 権限モデル(3軸 + ロール) |
| `docs/DATA_MODEL.md` | Firestore データ構造 |
| `docs/DEPLOYMENT.md` | GCP セットアップ & デプロイ手順 |

## ローカル開発

```bash
npm install
cp .env.example .env   # 値を入れる(Firebase / Gemini / VAPID など)
npm run dev            # http://localhost:3000
```

> `.env` が未設定でもサーバーは起動します(ログインや API は設定投入後に有効化)。

## 初期セットアップ & デプロイ

GCP 側の準備(API一括有効化・Workload Identity・権限):

```bash
PROJECT_ID=your-project ./setup.sh
```

その後 GitHub の Secrets / Variables を登録し、`main` に push すると公開されます。
詳細は `docs/DEPLOYMENT.md`。

## 初期搭載アプリ

- **ヘルパー** (`support_agent`) — AI アシスタント(アプリの使い方・新規アプリ相談)
- **設定** (`settings`) — ユーザー管理 / アクセス権 / 料金(管理者のみ)

## UI ルール

UI 上のアイコンは**絵文字を使わず**、すべて [Google Material Symbols (Rounded)](https://fonts.google.com/icons) を `<Icon name="..." />` で描画する。アプリ frontmatter の `icon` フィールドにも Material Symbols 名(例: `savings`, `school`)を入れる。詳しくは `CLAUDE.md` の「UI / アイコンのルール」を参照。
