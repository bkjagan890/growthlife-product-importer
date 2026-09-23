FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production
CMD ["npm", "run", "docker-start"]
