# npm-serve

File and npm package server.

## TL;DR;

Issue the following command to use it:

```
$ npx @padcom/npm-serve .
```

or if you're a [Docker](https://www.docker.com/) fan:

```
$ docker run --rm -it \
  --name=npm-serve \
  -p 2998:2998 \
  -v $(pwd):/var/lib/npm-serve/static-files \
  padcom/npm-serve
```

## A bit of history

These days bundlers and sophisticated development tools for node.js and frontend are very much part the daily routine. Webpack, Rollup/Vite, Parcel - those are just a few examples of tools that a frontend developer can't live without.

But does it have to be like that?

Back in March 2021 a major feature landed in Chrome: `importmap`'s. Importmaps are a way to let the browser know where to look for packages when those are imported _in the browser_ using package name, e.g.

```
import { createApp } from 'vue'
```

Here's an example import map that will allow for the above syntax:

```
  <script type="importmap">
    {
      "imports": {
        "vue": "https://unpkg.com/vue@3.2.37/dist/vue.runtime.esm-browser.prod.js"
      }
    }
  </script>
```

The problem that arises is as follows: npm hosting facilities have a rather hard time providing the latest information about packages. Unpkg seems to be freezing every 30s while it is fetching the latest information from https://registry.npmjs.org which is very much an undesired behavior. On top of that it would be handy if we could use the same application to serve both application files and packages from the same application.

This is why `@padcom/npm-serve` has been created. Upon start it will serve all local files on port `2998` unless that file starts with `/package/` in which case the rest of the path will be treated as package coordinates, including scope, name, version/tag and path to the file. So if in your project you have an `index.html` that has reference to, let's say, vue.js then adding the following will allow for the application to serve that package:

```
  <script type="importmap">
    {
      "imports": {
        "vue": "/package/vue@3.2.37/dist/vue.runtime.esm-browser.prod.js"
      }
    }
  </script>
```

## Package coordinates

Let's look at an example, in this case `@padcom/mf-test-library1`:

```
  <script type="importmap">
    {
      "imports": {
        "library1": "/package/@padcom/mf-test-library1@0.0.2/dist/index.js"
      }
    }
  </script>
```

In this example:
- `@padcom` - package scope; required if package is scoped - otherwise leave empty; packages don't have to be scoped but if they are here's where you specify it
- `mf-test-library1` - required; the name of the package
- `0.0.2` - optional; version or tag of the package; if not specified `latest` is used
- `/dist/index.js` - optional; file to use; defaults to `package.json/main` field

So to always get the default export from latest `@padcom/mf-test-library1` use the following coordinates:

```
  "imports": {
    "library1": "/package/@padcom/mf-test-library1"
  }
```

or if you'd like to use the beta version:

```
  "imports": {
    "library2": "/package/@padcom/mf-test-library2@beta"
  }
```

or if you'd like to import another file from latest version:

```
  <link rel="stylesheet" href="/package/@padcom/mf-test-library3/dist/style.css">
```

### Quick note about deploying non-latest versions

When you want to [deploy a version for a different `tag`](https://docs.npmjs.com/adding-dist-tags-to-packages) (as npm calls them) you need to let npm know about it:

```
$ npm publish --tag beta
```

## Versioning

It'd be not very interesting if we couldn't serve multiple versions of the same package. Luckily we can omit the version all together, in which case `@padcom/npm-server` will take whatever the `latest` version is. If, however, the specified version is one of

```
  'latest', 'next', 'beta', 'alpha'
```

e.g. `/package/@padcom/mf-test-library2@beta`, the application will use that tag instead of `latest` allowing you to, for example, make a beta release of your module and switching between production and beta versions easily.

## CLI Options

When starting `@padcom/npm-serve` there are several options that you can use to tell the application where to store cached packages or where to serve files from.

### `-s location`

`-s location` tells the application where to store cached packages (doesn't work right now, always uses `$(cwd)/packages`)

### `-p port`

`-p port` tells the application to listen on a given port (default: 2998)

### Document root

If you want to serve files from another place than the current folder just append it as last command line parameter, e.g.:

```
$ npx @padcom/npm-serve ~/my-project
```

By default `@padcom/npm-serve` will use the current folder to look for files to serve.

## Caching strategy

Caching is an interesting topic in this context. Normally you'd want all the files to be as fresh as possible without doing any roundtrips to the server. That can't be accomplished 100% but we can get pretty close to it. For example, by providing `Cache-Control', 'max-age=30` we'll tell the browser to only make requests every 30 minutes and in between to use whatever content it (the browser) has currently cached. After that time the browser will make a request but it'd be pointless to transfer that same file again. This is where the `etag` comes into play. If the request contains `If-None-Match` header with a value that value will be compared to a calculated value (based currently on the timestamp of the cached package archive) which will make the browser use the cached file again.

However, in the meantime, when someone deploys a new version, we'd like to get that update. To achieve this the `@padcom/npm-serve` employs the _last good deploy_ approach serving whatever has been already cached but if the last update was more than 30s ago it will schedule an asynchronous update of the package. That way the user eventually gets whatever was up-to-date but each time a request is made it is processed with maximum speed.

## Strategies for dependency management

There are at least 3 main strategies when building applications that fetch modules from remote locations:

### Package everything

When building an application that uses some external packages, if you're using a bundler such as webpack or rollup all the dependencies that the application is using will be inlined in the resulting module definition. Those inlined packages will be a private copy thereof for use only with that particular module.

### Don't package common libraries

In this scenario main packages, such as Vue.js, React or Angular runtime will be provided by the host. The imported modules will be smaller, but will depend on the browser to know where to find them. Everything else can be inlined, making those other packages private to that module.

In the event when you export sort of a bootstrap function and delegate the initialization to the module this is a great option allowing you to host an application written in different frameworks. Each module is then treated as a microfrontend.

### Don't use a bundler

In this scenario every single imported module is listed in the `importmap`. No bundling required.

## Do's and Don'ts

Initially the idea of [microfrontends](https://micro-frontends.org/), created by [Michael Geers](https://geers.tv/), assumed that the rigth abstraction to implement microfrontends will be custom elements. However, besides few examples (some extremely prominent, such as Google Chrome settings page) not many projects use it in in favor of module composition. This package, in essence, implements the technical capability to use modules that are deployed to NPM registry - just without the use of `npm install`.

- If you don't have a very specific case don't use custom components as wrappers for microfrontends
- If you're all set on one framework (and that better be Vue.js :D) then export components from microfrontends. Vue has some exciting features for [async components](https://vuejs.org/guide/components/async.html)!
- If you really must be specific use a label (`latest`, `beta`) instead of a specific version
- If speed is what you have the need for then use full version with full path to the exported files; it'll limit the number of 302 responses

