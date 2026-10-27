FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.mjs ./
USER node
ENV HOST=0.0.0.0
ENV PORT=3100
EXPOSE 3100
CMD ["node", "server.mjs"]
