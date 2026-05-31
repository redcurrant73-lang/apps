#!/usr/bin/env bash
# ============================================================
# apps - ワンショット直接デプロイ (自分の端末 / Cloud Shell から)
#
#   GitHub Actions を介さず、手元から Cloud Run に直接公開する。
#   「とりあえず今すぐ公開して動かす」用。
#   CI/CD で push 自動公開したい場合は setup.sh + .github/workflows/deploy.yml
#
#   これ1つで:
#     1. 必要 API を有効化
#     2. Firestore (Native) データベースを作成
#     3. VAPID 鍵を自動生成(未指定時)
#     4. シークレットを Secret Manager に登録/更新
#     5. 実行SA / ビルドSA に権限付与
#     6. ソースから Cloud Run にデプロイ
#
# 使い方:
#   PROJECT_ID=xxx \
#   SUPERUSER_EMAIL=konishi0221@gmail.com \
#   OWNER_EMAIL=you@example.com \
#   GEMINI_API_KEY=AIza... \
#   FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}' \
#   ./deploy.sh
#
#   任意: REGION(既定 asia-northeast1) / SERVICE(既定 apps)
#         VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT を渡せば自動生成しない
# ============================================================
set -euo pipefail

# ---- 必須項目チェック ----
: "${PROJECT_ID:?PROJECT_ID が必要です}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY が必要です}"
: "${FIREBASE_CONFIG:?FIREBASE_CONFIG が必要です(Firebaseのウェブ設定を1行JSONで)}"
: "${SUPERUSER_EMAIL:?SUPERUSER_EMAIL が必要です(祐子さんのメール)}"
: "${OWNER_EMAIL:?OWNER_EMAIL が必要です(ゆうきさんのメール)}"

REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-apps}"
VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:${OWNER_EMAIL}}"

echo "==> プロジェクト ${PROJECT_ID} / リージョン ${REGION} / サービス ${SERVICE}"
gcloud config set project "${PROJECT_ID}" >/dev/null

# ---- 1) 必要 API を有効化 ----
echo "==> [1/6] API を有効化(初回は数分かかります)"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com generativelanguage.googleapis.com

# ---- 2) Firestore データベース(Native)----
echo "==> [2/6] Firestore データベースを作成"
gcloud firestore databases create --location="${REGION}" --type=firestore-native 2>/dev/null \
  || echo "   (既存) Firestore database はそのまま使用"

# ---- 3) VAPID 鍵(未指定なら自動生成)----
if [[ -z "${VAPID_PUBLIC_KEY:-}" || -z "${VAPID_PRIVATE_KEY:-}" ]]; then
  echo "==> [3/6] VAPID 鍵を自動生成"
  VAPID_JSON="$(npx --yes web-push generate-vapid-keys --json)"
  VAPID_PUBLIC_KEY="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).publicKey)" "${VAPID_JSON}")"
  VAPID_PRIVATE_KEY="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).privateKey)" "${VAPID_JSON}")"
else
  echo "==> [3/6] VAPID 鍵は指定値を使用"
fi

# ---- 4) シークレットを作成/更新 ----
echo "==> [4/6] シークレットを Secret Manager に登録"
upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "${name}" >/dev/null 2>&1; then
    printf '%s' "${value}" | gcloud secrets versions add "${name}" --data-file=- >/dev/null
  else
    printf '%s' "${value}" | gcloud secrets create "${name}" --data-file=- --replication-policy="automatic" >/dev/null
  fi
}
upsert_secret GEMINI_API_KEY    "${GEMINI_API_KEY}"
upsert_secret VAPID_PUBLIC_KEY  "${VAPID_PUBLIC_KEY}"
upsert_secret VAPID_PRIVATE_KEY "${VAPID_PRIVATE_KEY}"
upsert_secret VAPID_SUBJECT     "${VAPID_SUBJECT}"
upsert_secret FIREBASE_CONFIG   "${FIREBASE_CONFIG}"

# ---- 5) 実行SA / ビルドSA へ権限付与 ----
echo "==> [5/6] サービスアカウントに権限付与"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
# 実行時: Firestore / Storage / Secret 参照
for ROLE in roles/datastore.user roles/secretmanager.secretAccessor roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" --role="${ROLE}" >/dev/null
done
# `--source .` のビルドが logging / artifact push でコケるのを防ぐ
for BUILD_SA in "${RUNTIME_SA}" "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"; do
  for ROLE in roles/cloudbuild.builds.builder roles/logging.logWriter \
              roles/artifactregistry.writer roles/storage.admin; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${BUILD_SA}" --role="${ROLE}" >/dev/null 2>&1 || true
  done
done

# ---- 6) デプロイ(ソースから直接ビルド→Cloud Run)----
echo "==> [6/6] Cloud Run にデプロイ(ビルド込みで2〜4分)"
gcloud run deploy "${SERVICE}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars="NUXT_SUPERUSER_EMAIL=${SUPERUSER_EMAIL},NUXT_OWNER_EMAIL=${OWNER_EMAIL}" \
  --set-secrets="NUXT_GEMINI_API_KEY=GEMINI_API_KEY:latest,NUXT_VAPID_PUBLIC=VAPID_PUBLIC_KEY:latest,NUXT_VAPID_PRIVATE=VAPID_PRIVATE_KEY:latest,NUXT_VAPID_SUBJECT=VAPID_SUBJECT:latest,NUXT_PUBLIC_VAPID_PUBLIC=VAPID_PUBLIC_KEY:latest,NUXT_PUBLIC_FIREBASE_CONFIG=FIREBASE_CONFIG:latest"

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"
cat <<EOF

============================================================
✅ デプロイ完了
   URL: ${URL}

あと1手だけ(Google ログインを通すため):
  Firebase Console > Authentication
    1. Sign-in method > Google を「有効」にする
    2. Settings > 承認済みドメイン に「${URL#https://}」を追加
  → これで ${SUPERUSER_EMAIL} / ${OWNER_EMAIL} でログインできます
============================================================
EOF
