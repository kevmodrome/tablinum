FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/tablinum/package.json packages/tablinum/
COPY apps/web/package.json apps/web/
COPY examples/svelte/package.json examples/svelte/
COPY examples/vanilla/package.json examples/vanilla/
RUN npm ci
COPY . .
RUN npm run build -w tablinum
RUN npm run build -w tablinum-web

FROM nginx:alpine
COPY --from=build /app/apps/web/build /usr/share/nginx/html
