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
chai.should(); // var should = chai.should();
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
          q: 'sketch'
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
          q: 'fizzbuzz'
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
          q: 'text'
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
          q: 'court'
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
          q: 'clouded title',
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
          q: 'clouded title',
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
          q: 'clouded nonsenseword anothernonsenseword',
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
          q: 'clouded nonsenseword anothernonsenseword',
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
          q: 'clouded title anothernonsenseword',
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
          q: 'clouded nonsenseword anothernonsenseword',
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
          q: 'yoshi'
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
          q: 'mario'
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
          q: 'albino elephant',
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
          q: 'mario'
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
        q: 'mario'
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
  });
}
