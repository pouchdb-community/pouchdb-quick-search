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

var docs = require('./test-docs');

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
      }).then(function (rows) {
        rows.length.should.equal(1);
        rows[0].id.should.equal('3');
        rows[0].score.should.be.above(0);
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
      }).then(function (rows) {
        rows.length.should.equal(3);
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['2', '3', '1'], 'got incorrect doc order: ' + JSON.stringify(rows));
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
      }).then(function (rows) {
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(rows));
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
      }).then(function (rows) {
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1', '2'], 'got incorrect docs: ' + JSON.stringify(rows));
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
      }).then(function (rows) {
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(rows));
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
      }).then(function (rows) {
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal([], 'got incorrect docs: ' + JSON.stringify(rows));
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
      }).then(function (rows) {
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(rows));
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
      }).then(function (rows) {
        var ids = rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['1'], 'got incorrect docs: ' + JSON.stringify(rows));
      });
    });
  });
}
