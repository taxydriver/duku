# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TURBOPACK=false NODE_OPTIONS="--max-old-space-size=4096"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# (debug) show any next/document imports & any Pages Router special files in SOURCE
RUN echo ">>> scanning for next/document imports in source..." \
 && (grep -RIn --exclude-dir=node_modules --exclude-dir=.next 'next/document' . || true) \
 && echo ">>> scanning for Html/Main/NextScript in source..." \
 && (grep -RIn --exclude-dir=node_modules --exclude-dir=.next '<Html' . || true) \
 && (grep -RIn --exclude-dir=node_modules --exclude-dir=.next '<Main' . || true) \
 && (grep -RIn --exclude-dir=node_modules --exclude-dir=.next '<NextScript' . || true) \
 && echo ">>> scanning for Pages Router special files..." \
 && (find . -type f \( -name '_document.*' -o -name '_app.*' -o -name '404.*' \) \
      | grep -v node_modules | grep -v .next || true)
RUN npm run build   # webpack, not turbopack

# ---------- runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package*.json ./
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./ 2>/dev/null || true
EXPOSE 3000
CMD ["npm", "start"]