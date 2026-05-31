#!/usr/bin/env bash
# ============================================================
# apps - 初期セットアップ (GCP 側)
#   - 必要な API を一括有効化
#   - デプロイ用サービスアカウント + 権限
#   - Workload Identity Federation (GitHub Actions 用)
#   - 実行SAへの権限付与
#
# 使い方:
#   PROJECT_ID=your-project ./setup.sh
#   (REGION / REPO は環境変数で上書き可)
# ============================================================
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-asia-northeast1}"
REPO="${REPO:-redcurrant73-lang/apps}"
SERVICE="${SERVICE:-apps}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID を指定してください: PROJECT_ID=your-project ./setup.sh" >&2
  exit 1
fi

echo "==> プロジェクト: ${PROJECT_ID} / リージョン: ${REGION} / リポジトリ: ${REPO}"
gcloud config set project "${PROJECT_ID}" >/dev/null

# ------------------------------------------------------------
echo "==> 1) API を一括有効化"
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

# ------------------------------------------------------------
echo "==> 1.5) Firestore データベース (Native mode) を作成"
# API 有効化だけでは DB 実体は作られない。これが無いとアプリが 500 になる。
gcloud firestore databases create --location="${REGION}" --type=firestore-native 2>/dev/null \
  || echo "   (既存 or 作成済み) Firestore database"

# ------------------------------------------------------------
echo "==> 2) デプロイ用サービスアカウント"
SA_EMAIL="deployer@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create deployer \
  --display-name="GitHub Actions Deployer" 2>/dev/null || echo "   (既存) ${SA_EMAIL}"

for ROLE in roles/run.admin roles/cloudbuild.builds.editor \
            roles/artifactregistry.admin roles/iam.serviceAccountUser \
            roles/secretmanager.secretAccessor roles/storage.admin; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" --role="${ROLE}" >/dev/null
done

# ------------------------------------------------------------
echo "==> 2.5) ソースデプロイ(--source .)のビルド実行SAへ権限"
# `gcloud run deploy --source .` は Cloud Build でビルドする。
# そのビルドを実行する ID(プロジェクトにより Compute 既定SA / Cloud Build 既定SA)に
# 権限が無いと「ビルドは出来たが log 書けない/artifact push できない」で失敗する典型パターンを防ぐ。
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
for BUILD_SA in \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"; do
  for ROLE in roles/cloudbuild.builds.builder roles/logging.logWriter \
              roles/artifactregistry.writer roles/storage.admin; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${BUILD_SA}" --role="${ROLE}" >/dev/null 2>&1 || true
  done
done
# デプロイSAがビルド実行SAを借用(actAs)できるように
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser \
  --member="serviceAccount:${SA_EMAIL}" >/dev/null 2>&1 || true

# ------------------------------------------------------------
echo "==> 3) Cloud Run 実行サービスアカウントへ権限付与"
RUNTIME_SA="$(gcloud iam service-accounts list \
  --filter='displayName:Compute Engine default service account' \
  --format='value(email)' | head -n1 || true)"
if [[ -n "${RUNTIME_SA}" ]]; then
  for ROLE in roles/datastore.user roles/secretmanager.secretAccessor roles/storage.objectAdmin; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${RUNTIME_SA}" --role="${ROLE}" >/dev/null
  done
  echo "   実行SA: ${RUNTIME_SA}"
else
  echo "   (実行SAが見つかりませんでした。初回デプロイ後に再実行してください)"
fi

# ------------------------------------------------------------
echo "==> 4) Workload Identity Federation"
gcloud iam workload-identity-pools create github-pool \
  --location=global --display-name="GitHub Pool" 2>/dev/null || echo "   (既存) github-pool"

POOL_ID="$(gcloud iam workload-identity-pools describe github-pool \
  --location=global --format='value(name)')"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" 2>/dev/null \
  || echo "   (既存) github-provider"

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}" >/dev/null

WIF_PROVIDER="$(gcloud iam workload-identity-pools providers describe github-provider \
  --location=global --workload-identity-pool=github-pool --format='value(name)')"

# ------------------------------------------------------------
cat <<EOF

============================================================
セットアップ完了。次に GitHub 側へ登録してください。

  Settings > Secrets and variables > Actions

  [Secrets]
    WIF_PROVIDER  = ${WIF_PROVIDER}
    GCP_SA_EMAIL  = ${SA_EMAIL}

  [Variables]
    GCP_PROJECT_ID = ${PROJECT_ID}
    GCP_REGION     = ${REGION}
    SERVICE        = ${SERVICE}
    SUPERUSER_EMAIL= (祐子さんのメール)
    OWNER_EMAIL    = (ゆうきさんのメール)

シークレット(Secret Manager。値が未登録なら登録):
    GEMINI_API_KEY / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / FIREBASE_CONFIG
  例) npx web-push generate-vapid-keys で VAPID 鍵を生成

【手作業が要る Firebase 側】(gcloud では完結しない)
  1. Firebase Console > Authentication > Sign-in method
       → Google を「有効」にする
  2. 初回デプロイで Cloud Run の URL が出たら、その host を
       Authentication > Settings > 承認済みドメイン に追加
       (これが無いと Google ログインのポップアップが弾かれる)
  3. FIREBASE_CONFIG は Console > プロジェクトの設定 > マイアプリ(Web)
       の firebaseConfig を JSON 文字列にして Secret に入れる

その後、main に push すると自動デプロイされます。
============================================================
EOF
