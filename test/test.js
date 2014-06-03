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
      });
    });
  });
}
