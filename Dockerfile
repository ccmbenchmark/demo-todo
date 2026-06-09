# Build portable de demo-todo (Node.js / Express).
# Fonctionne à l'identique sur Dokploy, Coolify et Railway.
FROM node:22-alpine

WORKDIR /app

# Le .npmrc force le registre public npm (évite le registre privé CCM au build).
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
