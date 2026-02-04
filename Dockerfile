FROM node:20-alpine

WORKDIR /app

# 安装 sqlite3 依赖
RUN apk add --no-cache sqlite-libs

# 复制 backend 目录
COPY backend/package*.json ./
RUN npm ci --only=production

# 复制 backend 代码
COPY backend/ .

# 创建数据目录
RUN mkdir -p /data

# 暴露端口
EXPOSE 8080

# 启动应用
CMD ["node", "src/app.js"]
