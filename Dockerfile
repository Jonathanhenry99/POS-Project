# Mourden POS: satu layanan (API + web PWA). Database PostgreSQL disediakan terpisah (DATABASE_URL).
FROM node:22-bookworm-slim

WORKDIR /app

# Pasang dependensi dulu agar layer ini ter-cache saat hanya kode yang berubah.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Migrasi database dijalankan otomatis saat server mulai.
CMD ["npm", "start"]
