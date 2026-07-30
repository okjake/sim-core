# Multi-stage build. sim-core is a library, so this image exists to run
# examples/demo — consuming repos (sim-staybase, sim-bookbridge) copy this
# pattern for their own service.

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

RUN pnpm prune --prod

# ---------- runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 3000

# The demo entrypoint; consuming services override this with their own main.
CMD ["node", "-e", "require('./dist/index.js'); console.log('sim-core is a library — set your own CMD');"]
