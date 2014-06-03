'use strict';

var utils = require('./pouch-utils');
var lunr = require('lunr');
var uniq = require('uniq');
var index = lunr();


// return a map of terms to counts, e.g.
// {foo: 1, bar: 2}
function getTermCounts(terms) {
  var res = {};
  var i = -1;
  var len = terms.length;
  while (++i < len) {
    var term = terms[i];
    if (term in res) {
      res[term]++;
    } else {
      res[term] = 1;
    }
  }
  return res;
}

function getTokenStream(text) {
  return index.pipeline.run(lunr.tokenizer(text));
}

exports.search = utils.toPromise(function (opts, callback) {
  var pouch = this;
  var q = opts.q;
  var fields = opts.fields;
  var persistedIndexName = JSON.stringify(fields);

  var mapFun = function (doc, emit) {
    // just add all tokens from all fields for now
    // later, we can weight on a per-field basis
    var tokens = [];
    fields.forEach(function (field) {
      var text = doc[field];
      if (text) {
        tokens = tokens.concat(getTokenStream(text));
      }
    });
    var counts = getTermCounts(tokens);
    for (var term in counts) {
      if (counts.hasOwnProperty(term)) {
        emit(token, counts[term]);
      }
    }
  };

  // usually it doesn't matter if the user types the same
  // token more than once, in fact I think even Lucene does this
  var queryTerms = uniq(getTokenStream(q));

  var mrOpts = {saveAs: persistedIndexName, keys: queryTerms};

  pouch.query(mapFun, mrOpts).then(function (res) {

    // calculate cosine similarity using tf-idf, which is equal to
    // dot-product(q, d) / (norm(q) * norm(doc))
    //
    // TODO


    callback(null, res);
  }, function (err) {
    callback(err);
  });
});

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
