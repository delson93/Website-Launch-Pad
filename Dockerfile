FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN npm install --omit=dev --ignore-scripts
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
CMD ["node","server.mjs"]
