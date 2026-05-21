FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend
COPY index.html app.js i18n.js styles.css js ./ 
COPY vendor ./vendor
COPY logo-swiderski.png ./

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3847

CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
