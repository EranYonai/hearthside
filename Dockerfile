# syntax=docker/dockerfile:1
# One Dockerfile, three targets: `web`, `worker` and `decide` (the local model service). Images are multi-arch;
# building on an ARM64 host produces linux/arm64 images natively.
ARG NODE_IMAGE=node:26.13-trixie-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=true
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/decide/package.json apps/decide/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build-web
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
COPY . .
RUN pnpm --filter @hearthside/web build

FROM deps AS build-worker
COPY . .
RUN pnpm --filter @hearthside/worker deploy --prod --legacy /out

FROM deps AS build-decide
COPY . .
RUN pnpm --filter @hearthside/decide deploy --prod --legacy /out \
  # The runtime ships binaries for every OS; keep only Linux.
  && find /out/node_modules -type d -path '*onnxruntime-node/bin/napi-v*/*' \
    \( -name darwin -o -name win32 \) -prune -exec rm -rf {} +

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build-web --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build-web --chown=node:node /repo/packages/db/migrations ./migrations
ENV MIGRATIONS_DIR=/app/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build-worker --chown=node:node /out ./
USER node
CMD ["node", "src/main.ts"]

# Runs the categorization model on CPU. The model files live in the `models` volume, filled
# once by `node src/fetch-model.ts`; the service itself has no route to the internet.
FROM ${NODE_IMAGE} AS decide
# ORT_DISABLE_TELEMETRY: the runtime may try to report usage; the network blocks it anyway.
ENV NODE_ENV=production MODEL_DIR=/models/laya PORT=8080 ORT_DISABLE_TELEMETRY=1
WORKDIR /app
COPY --from=build-decide --chown=node:node /out ./
# A fresh named volume copies this folder's owner, so the node user can fill it.
RUN mkdir -p /models && chown node:node /models
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --start-interval=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>r.json()).then(b=>process.exit(b.status==='ok'?0:1),()=>process.exit(1))"]
CMD ["node", "src/main.ts"]
