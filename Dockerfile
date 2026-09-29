FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /var/data
ENV NODE_ENV=production PORT=3000 SQLITE_PATH=/var/data/didar.db
EXPOSE 3000
CMD ["npm", "start"]
