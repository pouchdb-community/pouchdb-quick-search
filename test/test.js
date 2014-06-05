/*jshint expr:true */
'use strict';

var Pouch = require('pouchdb');

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

var dbs;
if (process.browser) {
  dbs = 'testdb' + Math.random();
} else {
  dbs = process.env.TEST_DB;
}

dbs.split(',').forEach(function (db) {
  var dbType = /^http/.test(db) ? 'http' : 'local';
  tests(db, dbType);
});

var docs = require('./docs/test-docs');
var docs2 = require('./docs/test-docs-2');
var docs3 = require('./docs/test-docs-3');

function tests(dbName, dbType) {

  var db;

  beforeEach(function () {
    db = new Pouch(dbName);
    return db;
  });
  afterEach(function () {
    return Pouch.destroy(dbName);
  });
  describe(dbType + ': search test suite', function () {
    this.timeout(10000);
    
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
        return db.search(opts);
      }).then(function () {
        opts.stale = 'ok';
        opts.destroy = false;
        return db.search(opts);
      }).then(function (res) {
        res.rows.should.have.length(0, 'expect no search results for stale=ok');
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
  });
}
