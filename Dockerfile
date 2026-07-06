FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY db/ /usr/share/nginx/html/db/
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
