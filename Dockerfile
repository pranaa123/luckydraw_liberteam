# Konteks build harus direktori doorprize-baru, terpisah dari aplikasi lama.
FROM node:24-alpine AS assets
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scripts ./scripts
COPY resources ./resources
COPY public ./public
RUN npm run build

FROM dunglas/frankenphp:1-php8.3-alpine AS runtime
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
RUN install-php-extensions pdo_pgsql mbstring curl
WORKDIR /app
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY routes ./routes
COPY resources ./resources
COPY database ./database
COPY supabase/migrations ./supabase/migrations
COPY --from=assets /build/public ./public
COPY Caddyfile /etc/caddy/Caddyfile
ENV APP_ENV=production PORT=80
CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile"]
