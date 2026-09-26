# Build context: repository root (uses the workspace package-lock.json).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --include-workspace-root=false --no-audit --no-fund
COPY client client
RUN npm run build --workspace client

FROM nginx:1.28-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
