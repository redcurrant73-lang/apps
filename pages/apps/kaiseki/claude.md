# 懐石メニュー - 開発者向け仕様

## 公開モード
- audience: private
- dataScope: per-user
- visibility: superuser_only
- 認証必須: yes (requireAuth)

## 機能概要
お品書きの写真をアップロードすると、Gemini が料理名・読み方・解説・英語訳を自動生成する。

## データ構造

**Firestore**:
```
apps/kaiseki/users/{uid}/menus/{menuId}
  - title: string        ("2024年5月31日" 形式の自動生成タイトル)
  - imageId: string      (Cloud Storage のファイルキー)
  - dishes: Array<{
      nameJa: string     (料理名)
      reading: string    (ひらがな読み)
      category: string   (前菜/汁物/向付/椀物/焼き物/煮物/揚げ物/蒸し物/食事/水菓子/甘味)
      descriptionJa: string
      nameEn: string
      categoryEn: string (Amuse-Bouche/Appetizer/Soup/Sashimi/Grilled/Simmered/Fried/Steamed/Rice Course/Seasonal Fruits/Dessert)
      descriptionEn: string
    }>
  - createdAt: Timestamp
```

**Cloud Storage**:
```
apps/kaiseki/users/{uid}/{imageId}
```

## エンドポイント
- `POST /api/apps/kaiseki/analyze` — body: `{ image: base64, mimeType }` → `{ id, title, imageId, dishes }`
- `GET /api/apps/kaiseki/menus` → メニュー一覧 (id, title, imageId, dishCount, createdAt)
- `GET /api/apps/kaiseki/menus/[id]` → メニュー詳細 (全フィールド)
- `DELETE /api/apps/kaiseki/menus/[id]` → Firestore + Cloud Storage を両方削除
- `GET /api/apps/kaiseki/image/[imageId]` → 画像バイナリ (private, auth必須)

## コスト注意事項
- Gemini 呼び出しは analyze のみ (1枚アップロードにつき1回)
- 画像は client 側で 1600px / JPEG 0.85 に圧縮してから送信
- Gemini 使用量は recordGeminiUsage で billing/apiUsage に記録済み

## 編集時の注意
- analyze.post.ts の PROMPT を変えると解析精度が変わる
- dishes の順番はメニューに記載の順番を維持する設計
- 削除時は必ず Cloud Storage の画像も削除する (deleteImage を呼ぶこと)
