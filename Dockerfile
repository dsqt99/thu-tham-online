FROM php:8.2-fpm AS php_runtime

RUN apt-get update && apt-get install -y \
    libpng-dev libjpeg-dev libwebp-dev libfreetype6-dev zlib1g-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install gd \
    && docker-php-ext-install pdo pdo_mysql \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY . .


FROM nginx:latest AS webserver

COPY ./nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=php_runtime /var/www/html /var/www/html

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
