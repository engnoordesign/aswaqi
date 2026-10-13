# Aswaqi container image.
#   docker build -t aswaqi .                 production image (default target)
#   docker build --target test .             run type-check, build and test suite
ARG NODE_IMAGE=node:24-bookworm-slim

# ---- dependencies (cached separately from source changes) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build: regenerate shared/engine.js and the frontend bundle ----
FROM deps AS build
COPY . .
RUN npm run typecheck && npm run build

# ---- test: opt-in stage used by CI ----
FROM build AS test
RUN npm test

# ---- runtime: no npm packages needed, the frontend is pre-built ----
FROM ${NODE_IMAGE} AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Aswaqi" \
      org.opencontainers.image.description="Bilingual supermarket management: POS, inventory and accounting on SQLite" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/aswaqi.sqlite \
    BACKUP_DIR=/app/backups \
    ASWAQI_VERSION=${VERSION} \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
# Application code stays root-owned and read-only for the app user;
# only the data and backup directories are writable.
COPY --from=build /app/package.json /app/server.js ./
COPY --from=build /app/backend ./backend
COPY --from=build /app/shared/engine.js ./shared/engine.js
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups && chmod 700 /app/data /app/backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "scripts/healthcheck.js"]
CMD ["node", "server.js"]
