#!/bin/sh

docker run --rm -it -p 2998:2998 -v $(pwd)/docs:/var/lib/npm-serve/static-files -e NODE_NO_WARNINGS=1 node:alpine npx --silent -y @padcom/npm-serve /var/lib/npm-serve/static-files -q
