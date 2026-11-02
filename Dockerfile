# Both stages install from the single root package-lock.json, so they copy every
# workspace's package.json first (cached layer), then the source.

# --- Build the PWA client ---
FROM node:24-slim AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN npm run build -w @notes/client

# --- Runtime: Node server (uses built-in node:sqlite, no native deps) ---
FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    STATIC_DIR=/app/apps/client/dist \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @notes/server && npm cache clean --force
COPY apps/server/src apps/server/src
COPY apps/server/drizzle apps/server/drizzle
COPY --from=client /app/apps/client/dist apps/client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
WORKDIR /app/apps/server
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
