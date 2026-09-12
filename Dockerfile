# syntax=docker/dockerfile:1

# 构建阶段：安装依赖并产出静态文件。
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 运行阶段：nginx 托管静态产物。
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
