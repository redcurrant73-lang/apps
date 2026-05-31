# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

# 依存インストール(lock があれば ci、なければ install)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# ソースをコピーしてビルド
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run は PORT を渡してくる(既定 8080)。Nitro はこれを参照する。
ENV PORT=8080

# Nitro のビルド成果物だけを持ち込む(必要な依存はトレース済みで同梱される)
COPY --from=build /app/.output ./.output

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
