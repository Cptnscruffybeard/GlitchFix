FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 GLITCHFIX_DATA_DIR=/app/data
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
USER node
EXPOSE 3000
CMD ["npm","start"]
