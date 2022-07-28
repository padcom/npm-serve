FROM node:alpine

RUN mkdir -p /var/lib/npm-serve

WORKDIR /var/lib/npm-serve

EXPOSE 2998

CMD [ "npx", "--yes", "@padcom/npm-serve", "static-files" ]
