# --- Build the PWA client ---
FROM node:24-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Runtime: Node server (uses built-in node:sqlite, no native deps) ---
FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    STATIC_DIR=/app/client/dist \
    PORT=3000
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY --from=client /app/client/dist /app/client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
