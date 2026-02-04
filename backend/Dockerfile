FROM node:20-alpine

WORKDIR /app

# 安装 sqlite3 依赖
RUN apk add --no-cache sqlite-libs

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p /data

# 暴露端口
EXPOSE 8080

# 启动应用
CMD ["node", "src/app.js"]
