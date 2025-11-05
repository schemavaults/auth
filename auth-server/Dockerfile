FROM node:22-alpine AS nodejsbase

RUN apk update

FROM oven/bun:1.1.38 AS bunbase

# Copy over monorepo resources (just for packages)
WORKDIR /app
COPY package.json ./
COPY bun.lockb ./
COPY packages/ ./packages/

FROM bunbase AS buninstaller

RUN bun install

FROM buninstaller AS bunpackagesbuilder
RUN bun run build --filter="./packages/*"

# Install dependencies only when needed
FROM nodejsbase AS deps

# Ensure yarn is installed
RUN apk add yarn --no-cache

# Install jq for editing package.json
RUN apk add jq --no-cache

# Copy over monorepo resources
WORKDIR /app
COPY package.json /app/package.json
COPY turbo.json /app/turbo.json
COPY apps/auth-server/package.json /app/apps/auth-server/package.json
COPY apps/auth-server/turbo.json /app/apps/auth-server/turbo.json
COPY --from=bunpackagesbuilder /app/packages/ ./packages/

# Delete bun-specific packageManager field to allow installing/building with yarn/nodejs
WORKDIR /app
COPY dev/cleanup-scripts/delete_json_file_field.sh ./scripts/delete_json_file_field.sh
RUN chmod +x ./scripts/delete_json_file_field.sh
RUN ./scripts/delete_json_file_field.sh ./package.json packageManager



# Install with yarn
WORKDIR /app
RUN echo "nodeLinker: node-modules" >> .yarnrc.yml
RUN yarn set version berry
RUN yarn install

FROM deps AS config

WORKDIR /app
COPY --from=deps /app/apps/auth-server/package.json /app/apps/auth-server/package.json
COPY apps/auth-server/next.config.ts ./apps/auth-server/next.config.ts
COPY apps/auth-server/tsconfig.json ./apps/auth-server/tsconfig.json
COPY apps/auth-server/tailwind.config.js ./apps/auth-server/tailwind.config.js
COPY apps/auth-server/postcss.config.js ./apps/auth-server/postcss.config.js
COPY apps/auth-server/.eslintrc.json ./apps/auth-server/.eslintrc.json

FROM config AS development

ARG ENVIRONMENT=development
ENV NODE_ENV=$ENVIRONMENT
EXPOSE 6767
WORKDIR /app/apps/auth-server
CMD ["yarn", "run", "dev"]

FROM config AS source

WORKDIR /app
COPY apps/auth-server/src ./apps/auth-server/src
COPY apps/auth-server/public ./apps/auth-server/public

FROM source AS builder

# Disable Next.js telemetry https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Tells next.config.js to build for standalone instead of Vercel
ENV NEXT_STANDALONE_DOCKER_BUILD=1

WORKDIR /app/apps/auth-server
RUN yarn build

# Production image, copy all the files and run next
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/apps/auth-server/.next/standalone ./
WORKDIR /app/apps/auth-server
COPY --from=builder --chown=nextjs:nodejs /app/apps/auth-server/.next/static ./.next/static

# Copy static public/ files
COPY --from=builder /app/apps/auth-server/public /app/apps/auth-server/public
RUN chown -R nextjs:nodejs /app/apps/auth-server/public

# debug logging
RUN ls -la /app
RUN ls -la /app/apps/auth-server

### All files are copied onto the image now, just run it ###

USER nextjs
EXPOSE 6767
ENV PORT=6767
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "/app/apps/auth-server/server.js"]
