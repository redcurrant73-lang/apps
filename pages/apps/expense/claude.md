# 交通費報告アプリ 開発仕様

## 基本情報
- slug: `expense`
- audience: `private`
- dataScope: `per-user`
- visibility: `superuser_only`
- 利用者: 小西祐子さん専用

## 機能概要

### 1. 交通費の記録（3通り）
- **領収書OCR**: 新幹線PDF・画像をGemini Vision APIで自動読み取り
- **保存ルート**: よく使うルートを登録し、日付・方向だけ選んで記録
- **手動入力**: 日付・区間・金額・交通手段などを手動入力

### 2. 月別一覧表示
- 月セレクター（前後矢印）
- 合計金額表示
- 日付別グループ表示

### 3. Excel報告書出力
- 会社指定テンプレート（.xlsx）をアップロード→Geminiで列マッピング自動学習
- テンプレートなしの場合はデフォルトフォーマットで出力
- Web Share API（モバイル）またはダウンロード

## Firestoreデータ構造

```
apps/expense/users/{uid}/
  expenses/{id}: {
    date: string (YYYY-MM-DD),
    type: 'shinkansen' | 'train' | 'bus' | 'taxi' | 'other',
    from: string,
    to: string,
    amount: number,
    direction: 'outbound' | 'return' | 'round' | 'one-way',
    addressee: string | null,
    notes: string | null,
    receiptImageId: string | null,
    createdAt: Timestamp
  }
  routes/{id}: {
    name: string,
    from: string,
    to: string,
    type: string,
    amount: number,
    createdAt: Timestamp,
    updatedAt: Timestamp
  }
  meta/settings (document): {
    savedAddressees: string[],
    reportEmailTo: string,
    excelTemplateId: string | undefined,    // Cloud Storage filename
    excelTemplateMapping: object | undefined // Gemini-learned column mapping
  }
```

## Cloud Storage
- テンプレートファイル: `apps/expense/users/{uid}/template_{timestamp}.xlsx`

## API一覧

| エンドポイント | 説明 |
|---|---|
| GET /api/apps/expense/expenses?month=YYYY-MM | 月別交通費取得 |
| POST /api/apps/expense/expenses | 交通費追加 |
| DELETE /api/apps/expense/expenses/{id} | 交通費削除 |
| POST /api/apps/expense/ocr | 領収書OCR |
| GET /api/apps/expense/routes | 保存ルート取得 |
| POST /api/apps/expense/routes | 保存ルート追加 |
| DELETE /api/apps/expense/routes/{id} | 保存ルート削除 |
| GET /api/apps/expense/settings | 設定取得 |
| POST /api/apps/expense/settings | 設定保存 |
| POST /api/apps/expense/template | Excelテンプレート登録 |
| POST /api/apps/expense/export | Excel報告書生成 |

## 依存ライブラリ
- `exceljs`: Excelファイルの読み書き（追加済み）
- `@google-cloud/aiplatform` (Gemini via Vertex AI): OCRと列マッピング

## 権限
全APIで `requireSuperuser(event)` を使用（祐子さん専用）

## 今後の拡張候補
- 往復記録の自動作成（行きと帰りを一括登録）
- 月次の自動リマインド通知
- 過去の記録からの入力候補サジェスト
