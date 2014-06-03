'use strict';

var utils = require('./pouch-utils');
var lunr = require('lunr');

exports.search = utils.toPromise(function (opts, callback) {
  //
  // You can use the following code to 
  // get the pouch or PouchDB objects
  //
  var pouch = this;
  var q = opts.q;
  var fields = opts.fields;
  var name = opts.name;

  var mapFun = function (doc, emit) {

    var index = lunr(function () {
      var self = this;

      fields.forEach(function (field) {
        self.field(field);
        self.ref('_id');
      });
    });

    index.add(doc);

    // HACK: no TF-IDF or anything fancy, just iterating thru
    // tokens
    index.corpusTokens.elements.forEach(function (token) {
      emit(token);
    });
  };

  pouch.query({map: mapFun}, {saveAs: name, key: q}).then(function (res) {
    callback(null, res);
  }, function (err) {
    callback(err);
  });
});

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
