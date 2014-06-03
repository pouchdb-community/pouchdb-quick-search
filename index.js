'use strict';

var utils = require('./pouch-utils');
var Promise = utils.Promise;
var lunr = require('lunr');
var flatten = require('flatten');
var uniq = require('uniq');
var index = lunr();

var TYPE_TOKEN_COUNT = 'a';
var TYPE_DOC_TOKEN_COUNT = 'b';

function add(left, right) {
  return left + right;
}

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

function calculateCosineSim(queryTerms, docIdsToTermCounts, termDFs) {
  // calculate cosine similarity using tf-idf, which is equal to
  // dot-product(q, d) / (norm(q) * norm(doc))
  // although there is no point in calculating the query norm,
  // because all we care about is the relative score for a given query,
  // so we ignore it (lucene does this too)
  //
  // then we return a sorted list of results, like:
  // [{id: {...}, score: 0.2}, {id: {...}, score: 0.1}];

  var results = Object.keys(docIdsToTermCounts).map(function (docId) {
    var termCounts = docIdsToTermCounts[docId];

    var termScores = {};
    Object.keys(termCounts).forEach(function (term) {
      var termDF = termDFs[term];
      var termTF = termCounts[term];
      var score = termTF / termDF;
      termScores[term] = score;
    });

    var docNorm = Object.keys(termScores).map(function (term) {
      return Math.pow(termScores[term], 2);
    }).reduce(add, 0);

    var dotProduct = queryTerms.map(function (queryTerm) {
      if (!(queryTerm in termScores)) {
        return 0;
      }
      var docScore = termScores[queryTerm];
      var queryScore = 1 / termDFs[queryTerm];
      return docScore * queryScore;
    }).reduce(add, 0);

    var finalScore = dotProduct / docNorm;

    return {
      id: docId,
      score: finalScore
    };
  });

  results.sort(function (a, b) {
    return a.score < b.score ? 1 : (a.score > b.score ? -1 : 0);
  });

  return results;
}

exports.search = utils.toPromise(function (opts, callback) {
  var pouch = this;
  var q = opts.q;
  var fields = opts.fields;
  var persistedIndexName = JSON.stringify(fields);

  var mapFun = function (doc, emit) {
    // just add all tokens from all fields for now
    // later, we can weight on a per-field basis
    var terms = [];
    fields.forEach(function (field) {
      var text = doc[field];
      if (text) {
        terms = terms.concat(getTokenStream(text));
      }
    });
    for (var i = 0, len = terms.length; i < len; i++) {
      var term = terms[i];
      emit([TYPE_TOKEN_COUNT, term]);
    }
    var termCounts = getTermCounts(terms);
    emit([TYPE_DOC_TOKEN_COUNT, doc._id], termCounts);
  };

  // usually it doesn't matter if the user types the same
  // token more than once, in fact I think even Lucene does this
  var queryTerms = uniq(getTokenStream(q));
  var keys = queryTerms.map(function (queryTerm) {
    return [TYPE_TOKEN_COUNT, queryTerm];
  });
  var queryOpts = {
    saveAs: persistedIndexName,
    keys: keys
  };

  // search algorithm, basically classic TF-IDF
  //
  // step 1: get the docs associated with the terms in the query
  // step 2: get all terms associated with those docs
  // step 3: get the IDF counts for all those terms
  // step 4: calculate cosine similarity using tf-idf
  //


  // step 1
  pouch.query(mapFun, queryOpts).then(function (res) {

    if (!res.rows.length) {
      return callback(null, []);
    }

    var docIds = uniq(res.rows.map(function (row) {
      return row.id;
    }));

    var keys = docIds.map(function (docId) {
      return [TYPE_DOC_TOKEN_COUNT, docId];
    });

    var queryOpts = {
      saveAs: persistedIndexName,
      keys: keys
    };

    // step 2
    return pouch.query(mapFun, queryOpts).then(function (res) {

      var docIdsToTermCounts = {};
      res.rows.forEach(function (row) {
        docIdsToTermCounts[row.id] = row.value;
      });

      var allUniqTerms = uniq(flatten(res.rows.map(function (row) {
        return Object.keys(row.value);
      })));

      var termDFs = {};
      // step 3
      return Promise.all(allUniqTerms.map(function (term) {
        var queryOpts = {
          saveAs: persistedIndexName,
          key : [TYPE_TOKEN_COUNT, term]
        };
        return pouch.query(mapFun, queryOpts);
      })).then(function (allResults) {
        for (var i = 0, len = allResults.length; i < len; i++) {
          termDFs[allUniqTerms[i]] = allResults[i].rows.length;
        }
        // step 4
        // now we have all information, so calculate cosine similarity
        callback(null, calculateCosineSim(queryTerms, docIdsToTermCounts, termDFs));
      });
    });
  }).catch(function (err) {
    callback(err);
  });
});

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
