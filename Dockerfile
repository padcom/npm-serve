FROM node:alpine

ENV NODE_NO_WARNINGS=1

RUN npm config set update-notifier false

RUN mkdir -p /var/lib/npm-serve

WORKDIR /var/lib/npm-serve

EXPOSE 2998

CMD [ "npx", "--silent", "--yes", "@padcom/npm-serve", "static-files" ]
