/*jshint expr:true */
'use strict';

var Pouch = require('pouchdb-memory');
var uniq = require('uniq');

//
// your plugin goes here
//
var helloPlugin = require('../');
Pouch.plugin(helloPlugin);

var chai = require('chai');
chai.use(require("chai-as-promised"));

//
// more variables you might want
//
var should = chai.should(); // var should = chai.should();
require('bluebird'); // var Promise = require('bluebird');

// have to make this global for the languages plugin, sadly
global.lunr = require('lunr');
require('./deps/lunr.stemmer.support')(global.lunr);
require('./deps/lunr.fr')(global.lunr);
require('./deps/lunr.multi')(global.lunr);
var dbs;
if (process.browser) {
  dbs = 'testdb' + Math.random();
} else {
  dbs = process.env.TEST_DB || 'testdb';
}

dbs.split(',').forEach(function (db) {
  var dbType = /^http/.test(db) ? 'http' : 'local';
  tests(db, dbType);
});

var docs = require('./docs/test-docs');
var docs2 = require('./docs/test-docs-2');
var docs3 = require('./docs/test-docs-3');
var docs4 = require('./docs/test-docs-4');
var docs5 = require('./docs/test-docs-5');
var docs6 = require('./docs/test-docs-6');
var docs7 = require('./docs/test-docs-7');
var docs8 = require('./docs/test-docs-8');
var docs9 = require('./docs/test-docs-9');

function tests(dbName, dbType) {

  var db;

  describe(dbType + ': search test suite', function () {
    this.timeout(30000);

    beforeEach(function () {
      db = new Pouch(dbName);
      return db;
    });
    afterEach(function () {
      return db.destroy();
    });

    it('basic search', function () {
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'sketch'
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.equal(1);
        res.rows[0].id.should.equal('3');
        res.rows[0].score.should.be.above(0);
      });
    });

    it('basic search - zero results', function () {
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'fizzbuzz'
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.equal(0);
      });
    });

    it('basic search - equal scores', function () {
      return db.bulkDocs({docs: docs2}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'text'
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.equal(2);
        res.rows[0].score.should.equal(res.rows[1].score);
      });
    });

    it('basic search - ordering', function () {

      // the word "court" is used once in the first doc,
      // twice in the second, and twice in the third,
      // but the third is longest, so tf-idf should give us
      // 2 3 1

      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'court'
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.equal(3);
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '3', '1'], 'got incorrect doc order: ' + JSON.stringify(res));
      });
    });

    it('search with mm=100% and 1/2 match', function () {

      // if mm (minimum should match) is 100%, that means all terms in the
      // query must be present in the document. I find this most intuitive,
      // so it's the default

      // docs 1 and 2 both contain the word 'title', but only 1 contains
      // both of the words 'title' and 'clouded'

      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'clouded title',
          mm: '100%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });

    it('search with mm=50% and 2/2 match', function () {
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'clouded title',
          mm: '50%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });

    it('search with mm=1% and 1/3 match', function () {
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'clouded nonsenseword anothernonsenseword',
          mm: '1%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });

    it('search with mm=34% and 1/3 match', function () {
      // should be rounded down to two decimal places ala Solr
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'clouded nonsenseword anothernonsenseword',
          mm: '34%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal([], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });
    it('search with mm=34% and 2/3 match', function () {
      // should be rounded down to two decimal places ala Solr
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'clouded title anothernonsenseword',
          mm: '34%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });
    it('search with mm=33% and 1/3 match', function () {
      // should be rounded down to two decimal places ala Solr
      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'clouded nonsenseword anothernonsenseword',
          mm: '33%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });

    it('should weight short fields more strongly', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'yoshi'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score, 'score should be higher');
      });
    });

    it('should weight short fields more strongly part 2', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'mario'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '1'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score, 'score should be higher');
      });
    });

    it('should use dismax weighting', function () {
      // see http://lucene.apache.org/core/3_0_3/api/core/org/apache/
      //     lucene/search/DisjunctionMaxQuery.html
      // for why this example makes sense

      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'albino elephant',
          mm: '50%'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['3', '4'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score, 'score should be higher');
      });
    });

    it('should work with one field only', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: ['text'],
          query: 'mario'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });

    it('should be able to delete', function () {
      var opts = {
        fields: ['text'],
        query: 'mario'
      };
      return db.bulkDocs({docs: docs3}).then(function () {
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(res));
        opts.destroy = true;
        delete opts.query;
        return db.search(opts);
      }).then(function () {
        opts.stale = 'ok';
        opts.destroy = false;
        opts.query = 'mario';
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(0, 'expect no search results for stale=ok');
      });
    });

    it('gives zero results when stale', function () {
      var opts = {
        fields: ['text', 'title'],
        query: 'mario',
        stale: 'ok'
      };
      return db.bulkDocs({docs: docs3}).then(function () {
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(0, 'no results after stale=ok');
        opts.stale = 'update_after';
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.be.within(0, 2, 'no results after stale=update_after');
        delete opts.stale;
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(2, 'got results eventually');
      });
    });

    it('can explicitly build an index', function () {
      var opts = {
        fields: ['text', 'title'],
        build: true
      };
      return db.bulkDocs({docs: docs3}).then(function () {
        return db.search(opts);
      }).then(function (info) {
        info.should.deep.equal({ok: true});
        delete opts.build;
        opts.query = 'mario';
        opts.stale = 'ok';
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(2, 'got results after building');
      });
    });

    it('uniquely IDs same fields with different order', function () {
      var opts = {
        fields: ['text', 'title'],
        query: 'mario'
      };
      return db.bulkDocs({docs: docs3}).then(function () {
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '1'], 'got incorrect docs: ' + JSON.stringify(res));
        opts = {
          fields: ['title', 'text'],
          query: 'mario',
          stale: 'ok'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '1'], 'got incorrect docs: ' + JSON.stringify(res));
      });
    });

    it('should work with pure stopwords', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: ['text'],
          query: 'to be or not to be'
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(0);
      });
    });

    it('allows you to weight fields', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 10, 'title': 1},
          query: 'mario'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score);
      });
    });

    it('allows you to weight fields part 2', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 10, 'title': 1},
          query: 'yoshi'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '1'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score);
      });
    });

    it('allows you to highlight', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 1, 'title': 1},
          query: 'yoshi',
          highlighting: true
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score);
        var hls = res.rows.map(function (x) { return x.highlighting; });
        hls.should.deep.equal([
          {title: 'This title is about <strong>Yoshi</strong>'},
          {text: "This text is about <strong>Yoshi</strong>, but it's " +
            "much longer, so it shouldn't be weighted so much."}
        ]);
      });
    });
    it('allows you to highlight with custom tags', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 1, 'title': 1},
          query: 'yoshi',
          highlighting: true,
          highlighting_pre: '<em>',
          highlighting_post: '</em>'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score);
        var hls = res.rows.map(function (x) { return x.highlighting; });
        hls.should.deep.equal([
          {title: 'This title is about <em>Yoshi</em>'},
          {text: "This text is about <em>Yoshi</em>, but it's " +
            "much longer, so it shouldn't be weighted so much."}
        ]);
      });
    });
    it('supports include_docs', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 1, 'title': 1},
          q: 'yoshi',
          include_docs: true
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        var docs = res.rows.map(function (x) {
          return {
            _id: x.doc._id,
            text: x.doc.text,
            title: x.doc.title
          };
        });
        docs.should.deep.equal(docs3.slice(0, 2));
      });
    });
    it("doesn't highlight or include docs by default", function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 1, 'title': 1},
          q: 'yoshi'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        should.not.exist(ids[0].doc);
        should.not.exist(ids[0].highlighting);
      });
    });
    it('can highlight and include docs at the same time', function () {
      return db.bulkDocs({docs: docs3}).then(function () {
        var opts = {
          fields: {'text': 1, 'title': 1},
          query: 'yoshi',
          highlighting: true,
          include_docs: true
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(res));
        res.rows[0].score.should.not.equal(res.rows[1].score);
        var hls = res.rows.map(function (x) { return x.highlighting; });
        hls.should.deep.equal([
          {title: 'This title is about <strong>Yoshi</strong>'},
          {text: "This text is about <strong>Yoshi</strong>, but it's " +
            "much longer, so it shouldn't be weighted so much."}
        ]);
        var docs = res.rows.map(function (x) {
          return {
            _id: x.doc._id,
            text: x.doc.text,
            title: x.doc.title
          };
        });
        docs.should.deep.equal(docs3.slice(0, 2));
      });
    });

    it('supports limit', function () {
      return db.bulkDocs({docs: docs4}).then(function () {
        var opts = {
          fields: ['text', 'title'],
          query: 'yoshi',
          limit: 5
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(5);
        uniq(res.rows.map(function (x) { return x.score; })).should.have.length(5);
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['yoshi_0', 'yoshi_1', 'yoshi_2', 'yoshi_3', 'yoshi_4']);
      });
    });

    it('supports skip', function () {
      return db.bulkDocs({docs: docs4}).then(function () {
        var opts = {
          fields: ['text', 'title'],
          query: 'yoshi',
          skip: 15
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(5);
        uniq(res.rows.map(function (x) { return x.score; })).should.have.length(5);
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['yoshi_15', 'yoshi_16', 'yoshi_17', 'yoshi_18', 'yoshi_19']);
      });
    });

    it('supports limit and skip', function () {
      return db.bulkDocs({docs: docs4}).then(function () {
        var opts = {
          fields: ['text', 'title'],
          query: 'yoshi',
          skip: 10,
          limit: 5
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(5);
        uniq(res.rows.map(function (x) { return x.score; })).should.have.length(5);
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['yoshi_10', 'yoshi_11', 'yoshi_12', 'yoshi_13', 'yoshi_14']);
      });
    });

    it('allows searching deep fields', function () {
      return db.bulkDocs({docs: docs5}).then(function () {
        var opts = {
          fields: ['deep.structure.text'],
          query: 'squirrels'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2']);
      });
    });
    it('allows searching from an array of nested objects', function () {
      return db.bulkDocs({docs: docs9}).then(function () {
        var opts = {
          fields: ['nested.array.aField'],
          query: 'something'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; }).sort().reverse();
        ids.should.deep.equal(['2', '10']);
      });
    });
    it('allows searching string arrays', function () {
      return db.bulkDocs({docs: docs5}).then(function () {
        var opts = {
          fields: ['list'],
          query: 'array'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1']);
      });
    });
    it('does nothing when the field is invalid', function () {
      return db.bulkDocs({docs: docs5}).then(function () {
        var opts = {
          fields: ['invalid'],
          query: 'foo'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal([]);
      });
    });
    it('can use numbers as field values', function () {
      return db.bulkDocs({docs: docs5}).then(function () {
        var opts = {
          fields: ['aNumber'],
          query: '1'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['3']);
      });
    });
    it('weights higher when words are mentioned more than once', function () {
      return db.bulkDocs({docs: docs6}).then(function () {
        var opts = {
          fields: ['text'],
          query: 'word'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2']);
        res.rows[0].score.should.not.equal(res.rows[1].score);
      });
    });

    it('indexes english and french simultaneously', function () {
      return db.bulkDocs({docs: docs7}).then(function () {
        var opts = {
          fields: ['text'],
          query: 'parlera',
          language: 'fr'
        };
        return db.search(opts);
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2']);
        return db.search({
          fields: ['text'],
          query: 'parlera', // parlera -> parle, wouldn't work in English
          language: 'en',
          stale: 'ok'
        });
      }).then(function (res) {
        res.rows.should.have.length(0);
        return db.search({
          fields: ['text'],
          query: 'spleen',
          language: 'en',
          stale: 'ok'
        });
      }).then(function (res) {
        res.rows.should.have.length(0);
        return db.search({
          fields: ['text'],
          query: 'spleen',
          language: 'en'
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; }).sort();
        ids.should.deep.equal(['1', '2']);
        return db.search({
          fields: ['text'],
          query: 'works', // working -> works, wouldn't work in French
          language: 'en'
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; }).sort();
        ids.should.deep.equal(['3']);
        return db.search({
          fields: ['text'],
          query: 'works',
          stale: 'ok' // no lang specified, default should be english
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; }).sort();
        ids.should.deep.equal(['3']);
        return db.search({
          fields: ['text'],
          query: 'parlera',
          language: 'fr'
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2']);
        return db.search({
          fields: ['text'],
          query: 'parlera',
          language: ['en','fr']
        });
      }).then(function(res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2']);
        return db.search({
          fields: ['text'],
          query: 'spleen',
          language: ['en','fr']
        });
      }).then(function(res) {
        var ids = res.rows.map(function (x) { return x.id; }).sort();
        ids.should.deep.equal(['1', '2']);
        return db.search({
          fields: ['text'],
          query: 'works',
          language: ['en','fr']
        });
      }).then(function(res) {
        var ids = res.rows.map(function (x) { return x.id; }).sort();
        ids.should.deep.equal(['3']);
      });
    });

    it('search with filter', function () {

      // the word "court" is used in all 3 docs
      // but we filter out the doc._id === "2"

      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'court',
          filter: function (doc) { return doc._id !== "2"; }
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.equal(2);
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['3', '1']);
      });
    });

    it('search with filter - Error thrown ', function () {

      //the filter function will throw an Error for
      //one doc, which filter it out.

      var error;

      //filter function throw an error ?
      db.on('error', function (err) {
        error = err;
      });

      return db.bulkDocs({docs: docs}).then(function () {
        var opts = {
          fields: ['title', 'text', 'desc'],
          query: 'court',
          filter: function (doc) { if (doc._id === '1') { throw new Error("oups"); } return true; }
        };
        return db.search(opts);
      }).then(function (res) {
        res.rows.length.should.equal(2);
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '3']);
        error.should.have.property('message', 'oups');
      });
    });

    it('total_rows', function () {

      return db.bulkDocs({docs: docs8}).then(function () {
          var opts = {
              fields: ['category'],
              query: 'PL'
            };
          return db.search(opts);
        }).then(function (res) {
          res.total_rows.should.equal(3);
        });
    });

    it('total_rows with filter and limit', function () {

      return db.bulkDocs({docs: docs8}).then(function () {
          var opts = {
              fields: ['category'],
              query: 'PL',
              limit: 1,
              filter: function (doc) { return doc.type !== "static"; }
            };
          return db.search(opts);
        }).then(function (res) {
          res.total_rows.should.equal(2);
        });
    });

  });
}
