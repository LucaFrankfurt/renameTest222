FROM nginx:1.27-alpine

COPY public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --spider -q http://localhost/ || exit 1
