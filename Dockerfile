# syntax=docker/dockerfile:1

# Dev stage — source comes from a bind mount (docker-compose.dev.yml), only
# deps are baked into the image so `npm ci` isn't re-run on every start.
FROM node:22-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Builder stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build
# Prune devDependencies in place instead of a second `npm ci --omit=dev` in the
# runtime stage — no network fetch, just deletes what's already on disk.
RUN npm prune --omit=dev

# Runtime stage
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY src/data ./src/data
EXPOSE 3000
CMD ["node", "dist/index.cjs"]
