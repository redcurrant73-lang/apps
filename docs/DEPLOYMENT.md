# デプロイ手順(GitHub push → Cloud Run 自動公開)

このプロジェクトは **`main` ブランチに push されると GitHub Actions が Cloud Run に自動デプロイ**します。
ここでは、その「自動公開」を成立させるための GCP 側セットアップをまとめます。
（コマンドは Cloud Shell またはローカルの `gcloud` で実行）

> 一度セットアップすれば、以後は push するだけで公開されます。

---

## 0. 前提変数

```bash
export PROJECT_ID="あなたのGCPプロジェクトID"
export REGION="asia-northeast1"
export REPO="redcurrant73-lang/apps"        # GitHub の owner/repo
export SERVICE="apps"
gcloud config set project "$PROJECT_ID"
```

---

## 1. APIを一括有効化（コマンド一発）

```bash
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com iamcredentials.googleapis.com iam.googleapis.com \
  generativelanguage.googleapis.com aiplatform.googleapis.com \
  cloudscheduler.googleapis.com pubsub.googleapis.com cloudtasks.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com cloudtrace.googleapis.com \
  cloudbilling.googleapis.com bigquery.googleapis.com \
  translate.googleapis.com speech.googleapis.com texttospeech.googleapis.com \
  vision.googleapis.com documentai.googleapis.com youtube.googleapis.com \
  calendar-json.googleapis.com gmail.googleapis.com
```

`setup.sh` を実行しても同じこと（＋以下の WIF / シークレット雛形作成）ができます。

---

## 2. デプロイ用サービスアカウント

```bash
gcloud iam service-accounts create deployer \
  --display-name="GitHub Actions Deployer"

export SA_EMAIL="deployer@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in roles/run.admin roles/cloudbuild.builds.editor \
            roles/artifactregistry.admin roles/iam.serviceAccountUser \
            roles/secretmanager.secretAccessor roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE"
done
```

Cloud Run の**実行**サービスアカウント（既定は Compute default SA）には、
Firestore / Storage / Secret 参照の権限を付けます。

```bash
export RUNTIME_SA="$(gcloud iam service-accounts list \
  --filter='displayName:Compute Engine default service account' \
  --format='value(email)')"
for ROLE in roles/datastore.user roles/secretmanager.secretAccessor roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" --role="$ROLE"
done
```

---

## 3. Workload Identity Federation（鍵ファイル不要の GitHub 認証）

```bash
gcloud iam workload-identity-pools create github-pool \
  --location=global --display-name="GitHub Pool"

export POOL_ID="$(gcloud iam workload-identity-pools describe github-pool \
  --location=global --format='value(name)')"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# このリポジトリからのみ SA を借用できるようにする
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}"

# GitHub Secrets: WIF_PROVIDER に入れる値
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global --workload-identity-pool=github-pool \
  --format='value(name)'
```

---

## 4. シークレット登録（Secret Manager）

```bash
# 例: 値は実物に置き換える
printf '%s' "GEMINIのAPIキー"        | gcloud secrets create GEMINI_API_KEY     --data-file=-
printf '%s' "VAPID公開鍵"            | gcloud secrets create VAPID_PUBLIC_KEY   --data-file=-
printf '%s' "VAPID秘密鍵"            | gcloud secrets create VAPID_PRIVATE_KEY  --data-file=-
printf '%s' "mailto:you@example.com" | gcloud secrets create VAPID_SUBJECT      --data-file=-
printf '%s' '{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}' \
                                     | gcloud secrets create FIREBASE_CONFIG    --data-file=-
```

VAPID 鍵は次で生成できます: `npx web-push generate-vapid-keys`

---

## 5. GitHub リポジトリの Secrets / Variables

GitHub → リポジトリ → Settings → Secrets and variables → Actions

| 種類 | 名前 | 値 |
|---|---|---|
| Secret | `WIF_PROVIDER` | 手順3で出力された provider 名 |
| Secret | `GCP_SA_EMAIL` | `deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | あなたのプロジェクトID |
| Variable | `GCP_REGION` | `asia-northeast1` |
| Variable | `SUPERUSER_EMAIL` | 祐子さんのメール(初期ロール用) |
| Variable | `OWNER_EMAIL` | ゆうきさんのメール(初期ロール用) |

---

## 6. デプロイの仕組み（`.github/workflows/deploy.yml`）

- トリガー: `main` への push（手動実行 `workflow_dispatch` も可）
- 認証: Workload Identity Federation（鍵ファイル不使用）
- ビルド/公開: `gcloud run deploy $SERVICE --source .`（リポジトリ同梱の Dockerfile を使用）
- シークレット: `--set-secrets` で Secret Manager から実行時注入
- 初期ロール用メール: `--set-env-vars` で `NUXT_SUPERUSER_EMAIL` / `NUXT_OWNER_EMAIL`

公開後の URL は Actions ログ末尾、または:

```bash
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
```

---

## 7. 初回デプロイ

```bash
git checkout main
git pull
git push        # → GitHub Actions が走り、2〜4分で公開
```

> このリポジトリの開発は作業ブランチで行い、`main` にマージ/push した時点で本番反映されます。
