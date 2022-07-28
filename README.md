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

`-s location` tells the application where to store cached packages

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
- If you want to limit the number of possible versions (e.g. all lower than 3.0 but higer than 2.0) omit the part of version that you want the service to fill in automatically
- If speed is what you have the need for then use full version with full path to the exported files; it'll limit the number of 302 responses

## Substitutions

This is probably one of the more powerful features of `@padcom/npm-serve`. Let's examine the following scenarios

### Local development

> As a developer I want to work on part of the application that needs changes

In this case you probably want _all_ modules served from the registry besides one or more packages that are served locally. To achieve that navigate to:

http://localhost:2998?@scope/package=http://localhost:3009

where `@scope/package` is the package you want to substitute (@scope is mandatory for scoped packages) and `http://localhost:3009` is the local development server address.

This will substitute everything in the locally served static files.

### Using beta versions

> As a user I want to check out the latest beta version of a specific part of the system

In this case you probably want _all_ modules served from the registry but one of those needs to have a version that you need:

http://localhost:2998?@scope/package=0.0.2-beta

where `@scope/package` is the package you want to substitute (`@scope` is mandatory for scoped packages) and `0.0.2-beta` is the coordinate to the tag `beta` of version `0.0.2`.

This will substitute everything in the locally served static files setting the version to `0.0.2-beta`. Since `@padcom/npm-serve` is clever enough to know how to decode the `beta` version you will end up with the latest beta release for the given version, e.g. `@scope/package=0.0.2-beta.1`

### Remarks

The substitutions happen against the https://unpkg.com CDN. That means if you want those substitutions to work your initial definitions in `index.html` or connected javascript modules need to refer to the CDN.

Check out the example [index.html](https://github.com/padcom/npm-serve/blob/master/docs/index.html) and [main.js](https://github.com/padcom/npm-serve/blob/master/docs/main.js)

## Examples

[Microfrontends with Vue and React](https://github.com/padcom/importmap-vue3-react-mf-example) Multiple external libraries, common library, host.

To use this example cd to the `host` folder and issue the following command:

```
$ npx @padcom/npm-serve .
```

## Workflows

So, you have a pretty good understanding of how the `@padcom/npm-serve` package works and you can use it for a simple project, but how would you put together a massive project with multiple teams and tens of microfrontends?

First of all, since multiple teams and, most probably, multiple parts of the organization will be involved in the process it is important to _allow for separation of accidental commonalities_. Accidental commonalities (as opposed to _essential commonalities_) are things that are common for two or more teams but none of that common code is owned by any of those teams. For example, let's say we have the Dragons team that takes care of the shopping cart module and then another team, say the Pengiuns, that focuses 100% on ads. In a monorepo or monolith setup we'd have a single repository organized into subfolders (either top-level with monorepo or maybe as subfolder of `src` in a monolith) which means that every single time anybody changes anything in any of the modules then everybody will get it. That's how git works or rather that's how version control works. You may not notice any changes in your files but something new has arrived into your `.git` folder. That is completely unnecessary and in point of fact massively violates the Dependency Inversion Principle from the SOLID bunch.

With that we have the following _projects_, each living in their own, separate repository:

- main
- ads
- shopping-cart
- product
- product-list
- navigation
- search
- promotions

Let's say that each project will be deployed under the `@example` scope, which gives us the following packages and their default exports in their 0th version:

- @example/main@0.0.0/index.html
- @example/ads@0.0.0/dist/index.js exports { start }
- @example/shopping-cart@0.0.0/dist/index.js exports { start }
- @example/product@0.0.0/dist/index.js exports { start }
- @example/product-list@0.0.0/dist/index.js exports { start }
- @example/navigation@0.0.0/dist/index.js exports { start }
- @example/search@0.0.0/dist/index.js exports { start }
- @example/promotions@0.0.0/dist/index.js exports { start }

The `@example/main`, because it's `package.json`/`main` field will point to `index.html` that's the file that will be served by CDNs such as `@padcom/npm-serve` or [unpkg.com](https://unpkg.com). This gives us automatically the following versioning capabilities:

- declaring accessing host in any version, even partial or tag-based names would work
- declaring submodules to take the most up-to-date version up to certain limits (following semver)

All that needs to happen is that each of the modules is published to npm registry. But wait! Those are "my" things, the company won't allow others to use "my" code! Am I doomed?

Not at all, it's actually a pretty standard requirement to be able to publish npm packages to company-hosted (or SaaS-based) registry. What you can do here is to setup another proxy npm registry that will collect packages from multiple sources (npm and your private registry) and provides them all under one, common registry.

That, in fact, is what you should do anyways, because https://registry.npmjs.org can get really slow at times not to mention it can go offline at which point nothing works anymore. Having a caching proxy for npm packages will shield you and your company from those kinds of outages and speed up package installation in general.

Back to the story of Dragons and Penguins.

Today was a busy day for Penguins. The project manager brought to everyone's attention that notorious bug that the CEO has been talking about during Yesterday's all-hands meeting. The stakes are high, atmosphere is thick, everyone's on the edge and wants to get shit done ASAP.

Then he opens up a new terminal, navigates to the `ads` repository and starts his development environment. He can work either on a locally-served stripped down version of the lib or, assuming that the files are available somehow via http, hook them up directly to the dev server by navigating to `https://example-super.app?@example/ads=http://localhost:1234` where `1234` is the port where your files are served. And best of all, the rest of the application is served as-is in production! It just works!

The bug was actually easy to find and fix, it's just one of those things that never come up during testing or development and the users are furious that it doesn't work. John fixes it on a branch and pushes it to the remote repository.

Upon creating the PR a build system kicks in and runs all the tests and builds the package to verify John didn't break anything.

That PR gets immediatelly (yeah, right?) reviewed, last-minute changes are applied and reviewed again, all builds are green and you're ready to merge. But before you do that you deploy your code to the registry with the `@example/ads@0.0.1-beta.0`:

```
$ npm publish --tag beta
```

Then John navigates to https://example-super.app?@example/ads=0.0.1-beta to see his new code pulled in from npm and served. _Ups! That's am... I thought that wasn't doing that... Are you sure this is ok?_... So, next change, PR, review, automated tests and builds, and a few minutes later John publishes `@example/ads@0.0.1-beta.0`. Darn - John forgot to update the version number, but no worries - npm is ready for those silly mistakes and won't let you override anything by mistake (nor if that was your intention!). He then navigates to https://example-super.app?@example/ads=0.0.1-beta and after a while, when all the caches have been refreshed, he can finally see the hard work he and his collegues did that day.

His best buddy, Lucifer the Tester, will do that same thing to check if your fix does what you say it does. All is good, the branch is merged by Lucifer as a sort of rubber stamp that it's been verified and he signs it with blood. That mistuque act spins off another automated build that will increment the main patch version, build and publish the final product to the registry as `@example/ads@0.0.1`. A hot tee later everyone in the world gets the fix, and... then there is cacke :D

But, at the same time as the whole shabang with dudes at Penguins was going on, Marry has been working with the other Dragons on implementing a cool new feature for the shopping cart. They have been deploying 3 times Today already under `@example/shopping-cart@0.0.1-alpha`. The feature is still somewhat incomplete but it already shows where it will be situated in the shopping cart landscape. There are multiple endpoints for the shopping cart, after all users do love a quick overview of how much money they'll gladly transfer to our accounts. Jerry, the project manager, was just told that an update to the `alpha` version has been deployed that adds that green icon to the left of that thing. Jerry then navigates to https://example-super.app?@example/shopping-cart@0.0.1-aplha. He receives the application with `@example/shopping-cart@0.0.1-aplha.67` (yes, Marry and the other Dragons have been busy lately!) and enjoys the progress that's been made. Yet another boring day at the office...

In both cases both Marry could run both modified versions at the same time if someone would like to see the added green icon _there_ with that annoying bug in ads fixed.

A few months before Marry, John and Lucifer started working on the application, Sasha was setting up the deployment of the system. He knew to setup a proxy npm registry that will shield everyone from npmjs.org outages and has added the relevant information to _How to configure your setup.txt_ document that every new person joining the team has to get familiar with. Now everone enjoys fast `npm install`s and at the same time the source for Cloudfront won't have to fail while retrieving updates. He does that by using the `padcom/npm-serve` docker image, exposing port 2998 and mounting `/var/lib/npm-serve/static-files` to where the content of `@example/host@latest/dist` is stored and forwards that traffic via a local instance of *nginx to the outside world (IDK, it seems like the right thing to do to introduce some kind of request caching between the clients and a node.js application).

And that's it! That's how not only developers, but also managers and infrastructure can benefit from using the microfrontends.

Because I think that happy developers make for happy customers which turns into mony in everyone's pocket!

Peace!
