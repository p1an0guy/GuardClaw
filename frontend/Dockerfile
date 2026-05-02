FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
EXPOSE 3000

CMD ["npm", "run", "dev"]
