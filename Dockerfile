# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the app
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_ vars must be available at build time (baked into client bundle)
ARG NEXT_PUBLIC_COMPANY_COLOR
ARG NEXT_PUBLIC_DEEPGRAM_API_KEY
ARG NEXT_PUBLIC_AI_ROLE_NAME
ARG NEXT_PUBLIC_DEV_ROLE_NAME
ARG NEXT_PUBLIC_EUR_USD_RATE

ENV NEXT_PUBLIC_COMPANY_COLOR=$NEXT_PUBLIC_COMPANY_COLOR
ENV NEXT_PUBLIC_DEEPGRAM_API_KEY=$NEXT_PUBLIC_DEEPGRAM_API_KEY
ENV NEXT_PUBLIC_AI_ROLE_NAME=$NEXT_PUBLIC_AI_ROLE_NAME
ENV NEXT_PUBLIC_DEV_ROLE_NAME=$NEXT_PUBLIC_DEV_ROLE_NAME
ENV NEXT_PUBLIC_EUR_USD_RATE=$NEXT_PUBLIC_EUR_USD_RATE

RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

# Set by CI to the commit SHA; the deploy checks it after rollout.
ARG GIT_SHA=unknown
ENV APP_VERSION=$GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA
# Links the GHCR package to the repository (visibility + access follow it).
LABEL org.opencontainers.image.source=https://github.com/time-4-action/t4a-admin

CMD ["node", "server.js"]
