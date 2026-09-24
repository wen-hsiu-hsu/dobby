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

# Runtime stage — installs its own node_modules independently (rather than
# copying builder's) so BuildKit can run this npm ci in parallel with
# builder's build instead of serializing behind it; the cache mount below
# keeps the actual install fast either way.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/data ./src/data
EXPOSE 3000
CMD ["node", "dist/index.cjs"]
