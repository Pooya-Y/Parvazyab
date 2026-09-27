# Build context: repository root (uses the workspace package-lock.json).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false --no-audit --no-fund
COPY server/tsconfig.json server/tsconfig.build.json server/
COPY server/src server/src
RUN npm run build --workspace server

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false --omit=dev --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
WORKDIR /app/server
USER node
EXPOSE 4000
# Startup runs migrations and the demo seed; a cold first boot on a busy host can take a couple of minutes,
# and the worker and nginx wait for this check before starting.
HEALTHCHECK --interval=10s --timeout=3s --start-period=120s --retries=6 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
CMD ["node", "dist/server.js"]
