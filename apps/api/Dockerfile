# ═══════════════════════════════════════════════════════════════
#  API (NestJS + Prisma + Playwright)  ·  multi-stage build
#  Base image Playwright đã cài sẵn Chromium + toàn bộ thư viện hệ thống
#  (libnss3, libatk…) nên không phải tự cài — tiết kiệm ~200 dòng apt-get.
# ═══════════════════════════════════════════════════════════════

# ───────────── Stage 1: deps ─────────────
FROM mcr.microsoft.com/playwright:v1.47.2-jammy AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy manifest trước để tận dụng Docker layer cache:
# đổi source code KHÔNG làm mất cache của bước cài dependency.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile=false

# ───────────── Stage 2: build ─────────────
FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @og/shared build \
 && pnpm --filter @og/api exec prisma generate \
 && pnpm --filter @og/api build

# Loại devDependencies khỏi node_modules để image gọn hơn
RUN pnpm prune --prod

# ───────────── Stage 3: runtime ─────────────
FROM mcr.microsoft.com/playwright:v1.47.2-jammy AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    API_PORT=4000 \
    PLAYWRIGHT_HEADLESS=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

# Chạy bằng user không phải root (image Playwright có sẵn user "pwuser")
RUN chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
# migrate deploy chạy trước khi start: đảm bảo schema luôn khớp code
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
