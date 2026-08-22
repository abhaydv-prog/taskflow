# Build stage — installs deps, generates Prisma client, compiles TypeScript
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Runtime stage — includes devDependencies deliberately: the `prisma`
# CLI (needed for `prisma migrate deploy` at container startup) lives
# in devDependencies, and without it `npx prisma` tries to download a
# fresh copy from the registry on every container start, which is slow
# and can fail entirely in restricted network environments.
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

EXPOSE 3000

# Default command runs the API; docker-compose overrides this for the worker service.
CMD ["node", "dist/server.js"]