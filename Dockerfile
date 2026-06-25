FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
		corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
	elif [ -f package-lock.json ]; then \
		npm ci --omit=dev; \
	else \
		npm install --omit=dev; \
	fi

COPY addon.js server.js lib resources public ./

ENV NODE_ENV=production
ENV PORT=7000
ENV HOST=0.0.0.0
ENV PUBLIC_URL=https://highlights.tvflix.co.uk

EXPOSE 7000

USER node

CMD ["node", "server.js"]
