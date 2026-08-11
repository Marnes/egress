FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json core/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY tsconfig.base.json vitest.config.ts ./
COPY core core
COPY server server
COPY web web

ARG VITE_PUBLIC_URL=https://egress.co.za
ENV VITE_PUBLIC_URL=$VITE_PUBLIC_URL
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
ENV EGRESS_DB_PATH=/data/egress.sqlite

RUN mkdir /data && chown node:node /data
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "server"]
