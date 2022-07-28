#!/bin/sh

docker run --name=npm-serve --rm -it -p 2998:2998 -v $(pwd):/var/lib/npm-serve/static-files padcom/npm-serve
