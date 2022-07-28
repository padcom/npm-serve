#!/bin/sh

docker run --rm -it -p 2998:2998 -v $(pwd):/var/lib/npm-serve/static-files node:alpine npx -y @padcom/npm-serve /var/lib/npm-serve/static-files
