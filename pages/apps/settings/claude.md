# 設定(管理コンソール) - 開発者向け仕様

## 公開モード
- audience: private
- dataScope: global
- visibility: superuser_only(superuser / owner のみ表示)
- 認証必須: yes(かつ requireSuperuser)

## 決定理由
ユーザー管理・権限設定・課金確認はシステム管理機能なので superuser_only。
データは全体マスタ(users / appAccess / apiUsage)を扱うため global。

## 画面
- /apps/settings           メニュー
- /apps/settings/users     ユーザー一覧・ロール変更・削除
- /apps/settings/access    ユーザー×アプリのアクセス権マトリクス
- /apps/settings/billing   AI使用量・件数の概況

## エンドポイント(すべて requireSuperuser)
- GET  /api/admin/users        ユーザー一覧
- POST /api/admin/users        { action: 'setRole'|'delete', uid, role? }
- GET  /api/admin/access       { users, apps, grants } マトリクス用
- POST /api/admin/access       { uid, appId, grant: boolean }
- GET  /api/admin/billing      { usage, stats }

## データ構造
- users/{uid}                      role: owner|superuser|user
- appAccess/{uid}_{appId}          grantedBy, grantedAt
- apiUsage/{YYYY-MM-DD}            geminiCalls, geminiTokensIn, geminiTokensOut

## 編集時の注意
- 全エンドポイントで requireSuperuser を必須にする。
- owner ロールの付与は owner 本人のみ(users.post.ts で制御済み)。
- 自分自身の降格・削除は不可(誤操作防止)。
- 実コスト表示は Cloud Billing の BigQuery エクスポート前提。未設定なら usage 集計のみ。
