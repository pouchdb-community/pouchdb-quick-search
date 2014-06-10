PouchDB Quick Search
=====

[![Build Status](https://travis-ci.org/nolanlawson/pouchdb-quick-search.svg)](https://travis-ci.org/nolanlawson/pouchdb-quick-search)

**Nothing much to see here; this is a work in progress.**

```js
var pouch = new PouchDB('mydb');
var doc = {_id: 'mydoc', title: "Guess who?", text: "It's-a me, Mario!"};

pouch.put(doc).then(function () {
  return pouch.search({
    query: 'mario',
    fields: ['title', 'text'],
    include_docs: true,
    highlighting: true
  });
}).then(function (res) {
  console.log(res.rows[0].doc.text); // "It's-a me, Mario!"
  console.log(res.rows[0].highlighting); // {"text": "It's-a me, <strong>Mario</strong>!"}
});
```

A very efficient and accurate full-text search engine built on top of PouchDB. Analyzes English text, indexes it in a database, and allows you to query for documents using a simple API. Ideal for PhoneGap apps or any webapp that needs offline search support.

This is a local plugin, so it is not designed to work against CouchDB/Cloudant/etc.  If you'd like to search against the server, use the CouchDB Lucene plugin or something similar.

If you need prefix search (e.g. for autocompletion), then just use PouchDB itself.  The `allDocs()`/`query()` APIs plus `startkey` should give you everything you need for prefix lookup.

The underlying tokenization/stemming/stopword engine is [Lunr][]. If you'd like to see support for other languages than English, please file an issue in that repo.

Usage
--------

To use this plugin, include it after `pouchdb.js` in your HTML page:

```html
<script src="pouchdb.js"></script>
<script src="pouchdb.quick-search.js"></script>
```

This plugin is also available from Bower:

```
bower install pouchdb-quick-search
```

Or to use it in Node.js, just npm install it:

```
npm install pouchdb-quick-search
```

And then attach it to the `PouchDB` object:

```js
var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-quick-search'));
```

API
---------

**Topics:**

* Basic queries[#basic_queries]
* Document structure [#document_structure]
* Fetching the full documents [#fetching_the_full_documents]


### Basic queries

```js
pouch.search({
  query: 'your query here',
  fields: ['title', 'text']
}).then(function (res) {
  // handle results
}).catch(function (err) {
  // handle error
});
```

**Response:**

```js
{ rows: 
   [ 
     { id: 'mydoc5', score: 0.08027856564851082 },
     { id: 'mydoc3', score: 0.044194173824159216 },
     { id: 'mydoc4', score: 0.044194173824159216 }
   ] 
}
```

In the simplest case, you call `pouch.search()` with a `query` and a list of document `field`s to search.  If the document is missing that field, then it's simply skipped.  You can search one or more fields at a time.

The results contain a list of matching document `id`s and `score`s, with the highest-scoring documents listed first.

Like most PouchDB functions, the `search()` function returns a promise. But if you like callbacks, you can also use that style:

```js
pouch.search({
  query: 'your query here',
  fields: ['title', 'text']
}, function (err, res) {
  if (err) {
    // handle error
  } else {
    // handle results
  }
});
```

### Document structure

Your document fields can be strings or arrays of strings.  Use dots to separate deeply nested fields.

```js
var doc = {
  _id: 'mydoc',
  name: 'Princess Peach',
  likes: ['cakes', 'go-karts', 'turnips'],
  description: {
    summary: 'Can float in Mario 2.'
  } 
};

pouch.put(doc).then(function () {
  return pouch.search({
    query: 'peach',
    fields: ['name', 'likes', 'description.summary']
  });
});
```

**Response:**

```js
{
  "result" : { 
    "rows": [ 
      { 
        "id": "mydoc", 
        "score": 0.044194173824159216 
      } 
    ] 
  }
}
```

### Fetching the full documents

By default, the results only contain a list of document `id`s and `score`s. You can also use `{include_docs: true}` to get back the full documents:

```js
pouch.search({
  query: 'kong',
  fields: ['title', 'text'],
  include_docs: true
});
```

**Response:**

```js
{
    "rows": [
        {
            "doc": {
                "_id": "mydoc5",
                "_rev": "1-5252b7faa1062e74ef0881fc908274cd",
                "text": "This kong likes to surf!",
                "title": "Funky Kong"
            },
            "id": "mydoc5",
            "score": 0.08027856564851082
        },
        {
            "doc": {
                "_id": "mydoc3",
                "_rev": "1-895f4289f96485c86ab62b02603220ae",
                "text": "He's the leader of the bunch, you know him well.",
                "title": "Donkey Kong"
            },
            "id": "mydoc3",
            "score": 0.044194173824159216
        },
        {
            "doc": {
                "_id": "mydoc4",
                "_rev": "1-00117a7b1d05df952474206e51ff19a5",
                "text": "His coconut gun can fire in spurts.",
                "title": "Diddy Kong"
            },
            "id": "mydoc4",
            "score": 0.044194173824159216
        }
    ]
}
```

### Highlighting

A very handy option is `{highlighting: true}`, which returns the fields that the query matched, along with the keywords highlighted in context:

```js
pouch.search({
  query: 'kong',
  fields: ['title', 'text'],
  highlighting: true
});
```

**Response:**

```js
{
    "rows": [
        {
            "highlighting": {
                "text": "This <strong>kong</strong> likes to surf!",
                "title": "Funky <strong>Kong</strong>"
            },
            "id": "mydoc5",
            "score": 0.08027856564851082
        },
        {
            "highlighting": {
                "title": "Donkey <strong>Kong</strong>"
            },
            "id": "mydoc3",
            "score": 0.044194173824159216
        },
        {
            "highlighting": {
                "title": "Diddy <strong>Kong</strong>"
            },
            "id": "mydoc4",
            "score": 0.044194173824159216
        }
    ]
}
```

If you don't like `'<strong></strong>'`, you can also specify your own `highlighting_pre` and `highlighting_post` strings:

```js
pouch.search({
  query: 'kong',
  fields: ['title', 'text'],
  highlighting: true,
  highlighting_pre: '<em>',
  highlighting_post: '</em>'
});
```

**Response:**

```js
{
    "rows": [
        {
            "highlighting": {
                "text": "This <em>kong</em> likes to surf!",
                "title": "Funky <em>Kong</em>"
            },
            "id": "mydoc5",
            "score": 0.08027856564851082
        },
        {
            "highlighting": {
                "title": "Donkey <em>Kong</em>"
            },
            "id": "mydoc3",
            "score": 0.044194173824159216
        },
        {
            "highlighting": {
                "title": "Diddy <em>Kong</em>"
            },
            "id": "mydoc4",
            "score": 0.044194173824159216
        }
    ]
}
```

### Pagination

You can use `limit` and `skip`, just like with the `allDocs()`/`query()` API:

```js
pouch.search({
  query: 'kong',
  fields: ['title', 'text'],
  limit: 10,
  skip: 20
});
```

The performance concerns for `skip` that apply to `allDocs()`/`query()` do not apply so much here, because no matter what, we have to read in all the doc IDs and calculate their score in order to sort them correctly. In other words, it is guaranteed that you will read the doc IDs of all matching documents into memory, no matter what values you set for `limit` and `skip`.

What this will optimize, however, is the attachment of metadata like `doc` and `highlighting` &ndash; it will only be done for the subset of results that you want.


### Boosting fields

Fields may be boosted, if you pass in an object rather than an array:

```js
pouch.search({
  query: 'kong',
  fields: {
    'title': 1,
    'text': 5
  }
});
```

The default boost is `1`.  Shorter fields are naturally boosted relative to longer fields (see the algorithmic explanation below).

### Minimum should match (mm)

By default, every term in a query other than stopwords _must_ appear somewhere in the document in order for it to be matched.  If you want to relax this to allow just a subset of the terms to match, use the `mm` ("minimum should match") option, which is modeled after [Solr's `mm` option](https://wiki.apache.org/solr/DisMaxQParserPlugin#mm_.28Minimum_.27Should.27_Match.29).

Example 1: docs must contain both the terms `'donkey'` and `'kong'`:

```js
pouch.search({
  query: 'donkey kong',
  fields: ['title', 'text']
});
```

Example 2: docs must contain either of the terms `'donkey'` and `'kong'`:

```js
pouch.search({
  query: 'donkey kong',
  fields: ['title', 'text'],
  mm: '50%'
});
```

Example 3: docs must contain at least one of the three terms `'donkey'`, `'kong'`, and `'country'`:

```js
pouch.search({
  query: 'donkey kong country',
  fields: ['title', 'text'],
  mm: '33%'
});
```

The default `mm` value is `100%`.  All values must be provided as a percentage (ints are okay).

### Build an index

If you only use the `search()` method as described above, then it will be slow the first time you query, because the index has to be built up.

To avoid slow performance, you can explicitly tell the search plugin to build up the index using `{build: true}`:

```js
pouch.search({
  fields: ['title', 'text'],
  build: true
}).then(function (info) {
  // if build was successful, info is {"ok": true}
}).then(function (err) {
  // handle error
});
```

This will build up the index without querying it. If the database has changed since you last updated (e.g. new documents were added), then it will simply update the index with the new documents. If nothing has changed, then it won't do anything.

You must at least provide the `fields` you want to index.  Boosts don't matter.

### Deleting an index

If, for whatever reason, you need to delete an index that's been saved to disk, you can pass in `{destroy: true}` to the `search()` function, and instead of searching, it will delete the external search database.

```js
pouch.search({
  fields: ['title', 'text'],
  destroy: true
});
```

When you do this, you _must_ at least provide the `fields`, because external databases are created and identified based on the fields you want to index.  I.e. for every unique `fields` combination you want to index, a separate database will be created especially for that query. If you open up your developer tools, you can see it; it should have a name like `<mydbname>-search-<md5sum>` and look like this:

![extra database created for search](https://raw.githubusercontent.com/nolanlawson/pouchdb-quick-search/master/docs/extra_database.png)

### Stale queries

When you search, a [persistent map/reduce index](http://pouchdb.com/api.html#query_database) is created behind the scenes, in order to save the indexed data and provide the fastest possible queries.

This means you can use the `stale` options, as in the `query()` API, to get faster but less accurate results:

```js
// return immediately, update the index afterwards
pouch.search({
  query: 'donkey kong',
  fields: ['title', 'text'],
  stale: 'update_after'
});
```

or

```js
// 
pouch.search({
  query: 'donkey kong',
  fields: ['title', 'text'],
  stale: 'ok'
});
```

Most likely, though, you won't want to do this unless your database is frequently changing.

Algorithm
----

This plugin uses the classic search technique of [TF-IDF](https://en.wikipedia.org/wiki/TFIDF), which strikes a nice balance between accuracy and speed. It is probably the most widely deployed search algorithm in the world.

Additionally, it applies a per-field weighting based on the [DisMax](http://searchhub.org//2010/05/23/whats-a-dismax/) algorithm as used in [Apache Solr](https://lucene.apache.org/solr/), which means that short fields tend to be boosted relative to long fields.  This is useful for things like e.g. web page titles and web page contents, where the words in the titles are usually more significant than words in the contents.  For multi-word queries, this algorithm also has the nice effect of preferring documents that match both words, even across several fields.

For more information about the algorithms that guided this implementation, refer to the [Lucene Similarity documentation](https://lucene.apache.org/core/3_6_0/api/core/org/apache/lucene/search/Similarity.html).

Building
----
    npm install
    npm run build

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

[lunr]: https://github.com/olivernn/lunr.js