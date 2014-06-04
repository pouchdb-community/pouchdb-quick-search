PouchDB Quick Search
=====

[![Build Status](https://travis-ci.org/nolanlawson/pouchdb-quick-search.svg)](https://travis-ci.org/nolanlawson/pouchdb-quick-search)

**Nothing much to see here; this is a work in progress.**

A very efficient and accurate Lucene-style search engine built on top of PouchDB. Analyzes English text, indexes it in the database, and allows you to query for documents using a simple API. Ideal for PhoneGap apps or any webapp that needs offline search support.

This is a local plugin, so it is not designed to work against CouchDB/Cloudant/etc.  If you'd like to search against the server, use the CouchDB Lucene plugin or similar.

If you need prefix search (e.g. for autocompletion), then just use PouchDB itself.  The `allDocs()`/`query()` APIs plus `startkey` give you everything you need for lookups by prefix.

The underlying tokenization/stemming/stopword engine is Lunr. If you'd like to see support for other languages, go bug them to add more than just English.

Building
----
    npm install
    npm run build

Usage
--------

To use this plugin, include it after `pouchdb.js` in your HTML page:

```html
<script src="pouchdb.js"></script>
<script src="pouchdb.search.js"></script>
```

Or to use it in Node.js, just npm install it:

```
npm install pouchdb-search
```

And then attach it to the `PouchDB` object:

```js
var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-search'));
```

Testing
----

### In Node

This will run the tests in Node using LevelDB:

    npm test
    
You can also check for 100% code coverage using:

    npm run coverage

If you don't like the coverage results, change the values from 100 to something else in `package.json`, or add `/*istanbul ignore */` comments.


If you have mocha installed globally you can run single test with:
```
TEST_DB=local mocha --reporter spec --grep search_phrase
```

The `TEST_DB` environment variable specifies the database that PouchDB should use (see `package.json`).

### In the browser

Run `npm run dev` and then point your favorite browser to [http://127.0.0.1:8001/test/index.html](http://127.0.0.1:8001/test/index.html).

The query param `?grep=mysearch` will search for tests matching `mysearch`.

### Automated browser tests

You can run e.g.

    CLIENT=selenium:firefox npm test
    CLIENT=selenium:phantomjs npm test

This will run the tests automatically and the process will exit with a 0 or a 1 when it's done. Firefox uses IndexedDB, and PhantomJS uses WebSQL.
