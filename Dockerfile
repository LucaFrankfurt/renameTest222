FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/app.db \
    REQUIRE_PERSISTENT_DB=true

WORKDIR /app

# No third-party dependencies: the server uses node:http and node:sqlite only.
COPY package.json ./
COPY server.js ./
COPY public/ ./public/

RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3000

# Checked with node rather than wget/curl: node is guaranteed to exist in this
# image, and it honours PORT if it is overridden.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
