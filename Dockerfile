# bunkr (yangjae3dmap) — 정적 프론트 배포 이미지.
# Vite 빌드(Cesium 토큰은 빌드타임 ARG) → nginx 정적 서빙.
# 주: AI 결심지원 프록시(/api/llm/chat)는 vite dev/preview 미들웨어 전용이라
# 정적 이미지에는 포함되지 않는다(지도·시뮬만 배포).
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# VITE_ 접두사 빌드타임 주입 → import.meta.env 로 번들에 포함(공개 토큰).
ARG VITE_CESIUM_ION_TOKEN
ENV VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
