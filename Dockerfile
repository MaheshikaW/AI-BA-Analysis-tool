# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + serve frontend
FROM node:20-bookworm-slim
WORKDIR /app/backend

# Backend dependencies (better-sqlite3 has native bindings)
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY backend/ .

# Frontend build from stage 1 (backend serves from ../../frontend/dist)
COPY --from=frontend-build /build/dist /app/frontend/dist

RUN mkdir -p /app/backend/data

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
