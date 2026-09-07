FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html capacitor.config.json vite.config.js ./
COPY public ./public
COPY src ./src
COPY server/deckSchema.js ./server/deckSchema.js
RUN npm run build

FROM node:22.22.0-bookworm-slim AS runtime
ARG APP_VERSION=0.7.0
ENV NODE_ENV=production \
    PORT=4080 \
    APP_VERSION=${APP_VERSION} \
    CODEX_HOME=/app/.codex \
    HOME=/app
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@0.153.4 \
    && mkdir -p /app/data /app/.codex /app/public/downloads \
    && printf 'forced_login_method = "chatgpt"\ncli_auth_credentials_store = "file"\n' > /app/.codex/config.toml
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY catalog ./catalog
COPY public ./public
COPY --from=build /app/dist ./dist
RUN chown -R node:node /app
USER node
EXPOSE 4080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:4080/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
