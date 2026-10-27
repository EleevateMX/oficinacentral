# ---------- Compilación del cliente ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY client ./client
COPY shared ./shared
RUN npm run build

# ---------- Imagen final ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    NODE_OPTIONS=--no-warnings=ExperimentalWarning
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server/index.js"]
