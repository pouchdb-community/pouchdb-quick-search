'use strict';

var utils = require('./pouch-utils');
var lunr = require('lunr');
var uniq = require('uniq');

var index = lunr();

var TYPE_TOKEN_COUNT = 'a';
var TYPE_DOC_LEN_NORM = 'b';

function add(left, right) {
  return left + right;
}

function getTokenStream(text) {
  return index.pipeline.run(lunr.tokenizer(text));
}

function calculateCosineSim(queryTerms, termDFs, docIdsToQueryTerms,
                            docIdsToDocLenNorms) {
  // calculate cosine similarity using tf-idf, which is equal to
  // dot-product(q, d) / (norm(q) * norm(doc))
  // although there is no point in calculating the query norm,
  // because all we care about is the relative score for a given query,
  // so we ignore it (lucene does this too)
  //
  // then we return a sorted list of results, like:
  // [{id: {...}, score: 0.2}, {id: {...}, score: 0.1}];

  var results = Object.keys(docIdsToQueryTerms).map(function (docId) {
    var docQueryTermsToCounts = docIdsToQueryTerms[docId];
    var docLenNorm = docIdsToDocLenNorms[docId];

    var dotProduct = queryTerms.map(function (queryTerm) {
      if (!(queryTerm in docQueryTermsToCounts)) {
        return 0;
      }
      var termDF = termDFs[queryTerm];
      var termTF = docQueryTermsToCounts[queryTerm];
      var docScore = termTF / termDF; // TF-IDF for doc
      var queryScore = 1 / termDF; // TF-IDF for query, count assumed to be 1
      return docScore * queryScore;
    }).reduce(add, 0);

    var finalScore = dotProduct / docLenNorm;

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
  var persistedIndexName = 'search-' + utils.MD5(JSON.stringify(fields));

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
    terms.forEach(function (term) {
      emit(TYPE_TOKEN_COUNT + term);
    });
    var docLenNorm = Math.sqrt(terms.length);
    emit(TYPE_DOC_LEN_NORM + doc._id, docLenNorm);
  };

  // usually it doesn't matter if the user types the same
  // token more than once, in fact I think even Lucene does this
  var queryTerms = uniq(getTokenStream(q));
  var keys = queryTerms.map(function (queryTerm) {
    return TYPE_TOKEN_COUNT + queryTerm;
  });
  var queryOpts = {
    saveAs: persistedIndexName,
    keys: keys
  };

  // search algorithm, basically classic TF-IDF
  //
  // step 1: get the docs associated with the terms in the query
  // step 2: get the doc-len-norms of those documents
  // step 3: calculate cosine similarity using tf-idf
  //
  // note that we follow the Lucene convention (established in
  // DefaultSimilarity.java) of computing doc-len-norm as
  // 1 / Math.sqrt(numTerms)
  // which is an optimization that avoids having to look up every term
  // in that document and fully recompute its norm scores based on tf-idf
  // More info:
  // https://lucene.apache.org/core/3_6_0/api/core/org/apache/lucene/search/Similarity.html
  //


  // step 1
  pouch.query(mapFun, queryOpts).then(function (res) {

    if (!res.rows.length) {
      return callback(null, []);
    }

    var docIdsToQueryTerms = {};
    var termDFs = {};

    res.rows.forEach(function (row) {
      var term = row.key.substring(1);

      // calculate termDFs
      if (!(term in termDFs)) {
        termDFs[term] = 1;
      } else {
        termDFs[term]++;
      }

      // calculate docIdsToQueryTerms
      if (!(row.id in docIdsToQueryTerms)) {
        docIdsToQueryTerms[row.id] = {};
      }
      var docTerms = docIdsToQueryTerms[row.id];
      if (!(term in docTerms)) {
        docTerms[term] = 1;
      } else {
        docTerms[term]++;
      }
    });

    var keys = Object.keys(docIdsToQueryTerms).map(function (docId) {
      return TYPE_DOC_LEN_NORM + docId;
    });

    var queryOpts = {
      saveAs: persistedIndexName,
      keys: keys
    };

    // step 2
    return pouch.query(mapFun, queryOpts).then(function (res) {

      var docIdsToDocLenNorms = {};
      res.rows.forEach(function (row) {
        docIdsToDocLenNorms[row.id] = row.value;
      });
      // step 3
      // now we have all information, so calculate cosine similarity
      callback(null, calculateCosineSim(queryTerms, termDFs,
        docIdsToQueryTerms, docIdsToDocLenNorms));
    });
  }).catch(function (err) {
    callback(err);
  });
});

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
