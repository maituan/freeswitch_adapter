FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install || npm install --legacy-peer-deps

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100

COPY --from=base /app ./

EXPOSE 3100

CMD ["npm", "run", "start"]

