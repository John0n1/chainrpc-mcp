FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package.json LICENSE README.md ./
COPY --chown=node:node src ./src
USER node
ENTRYPOINT ["node", "src/index.js"]
CMD ["--stdio"]
