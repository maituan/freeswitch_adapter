# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

# Stage 2: Build Next.js
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Runtime image — supports next start, relay, and asr-proxy
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js build output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Source files needed by tsx scripts (relay-server, asr-proxy)
COPY --from=builder /app/src ./src
COPY --from=builder /app/relay-server ./relay-server
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Runtime deps (includes tsx, ws, @openai/agents, etc.)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000 8082 8091

# Default: Next.js. Override via docker-compose command:
#   npm run asr-proxy  → ASR proxy on :8082
#   npm run relay      → relay WS server on :8091
CMD ["npm", "run", "start"]
