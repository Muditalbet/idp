FROM node:20-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

# Simple healthcheck hitting the app's /healthz endpoint.
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "src/index.js"]
