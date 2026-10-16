FROM mcr.microsoft.com/playwright:v1.55.0-noble
ENV NODE_ENV=production PORT=3000 GLITCHFIX_DATA_DIR=/app/data
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js agents.js browser-worker.js ./
COPY public ./public
RUN mkdir -p /app/data && chown -R pwuser:pwuser /app
USER pwuser
EXPOSE 3000
CMD ["npm","start"]
