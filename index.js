'use strict';

// TODO: temporary hack that may go away
// later when map/reduce is broken out
// into persistence + map/reduce
var mapReduce = require('pouchdb-mapreduce');
Object.keys(mapReduce).forEach(function (key) {
  exports[key] = mapReduce[key];
});

var utils = require('./pouch-utils');
var lunr = require('lunr');
var uniq = require('uniq');
var Promise = utils.Promise;

var indexes = {};

var TYPE_TOKEN_COUNT = 'a';
var TYPE_DOC_INFO = 'b';

function add(left, right) {
  return left + right;
}

// get all the tokens found in the given text (non-unique)
// in the future, we might expand this to do more than just
// English. Also, this is a private Lunr API, hence why
// the Lunr version is pegged.
function getTokenStream(text, index) {
  return index.pipeline.run(lunr.tokenizer(text));
}

// given an object containing the field name and/or
// a deepField definition plus the doc, return the text for
// indexing
function getText(fieldBoost, doc) {
  var text;
  if (!fieldBoost.deepField) {
    text = doc[fieldBoost.field];
  } else { // "Enhance."
    text = doc;
    for (var i = 0, len = fieldBoost.deepField.length; i < len; i++) {
      text = text && text[fieldBoost.deepField[i]];
    }
  }
  if (text) {
    if (Array.isArray(text)) {
      text = text.join(' ');
    } else if (typeof text !== 'string') {
      text = text.toString();
    }
  }
  return text;
}

// map function that gets passed to map/reduce
// emits two types of key/values - one for each token
// and one for the field-len-norm
function createMapFunction(fieldBoosts, index, filter, db) {
  return function (doc, emit) {

    if (isFiltered(doc, filter, db)) {
      return;
    }

    var docInfo = [];

    for (var i = 0, len = fieldBoosts.length; i < len; i++) {
      var fieldBoost = fieldBoosts[i];

      var text = getText(fieldBoost, doc);

      var fieldLenNorm;
      if (text) {
        var terms = getTokenStream(text, index);
        for (var j = 0, jLen = terms.length; j < jLen; j++) {
          var term = terms[j];
          // avoid emitting the value if there's only one field;
          // it takes up unnecessary space on disk
          var value = fieldBoosts.length > 1 ? i : undefined;
          emit(TYPE_TOKEN_COUNT + term, value);
        }
        fieldLenNorm = Math.sqrt(terms.length);
      } else { // no tokens
        fieldLenNorm = 0;
      }
      docInfo.push(fieldLenNorm);
    }

    emit(TYPE_DOC_INFO + doc._id, docInfo);
  };
}

//Generate the unique index name for the a set of options
function genPersistedIndexName(opts) {
  // the index we save as a separate database is uniquely identified
  // by the fields the user want to index (boost doesn't matter)
  // plus the tokenizer
  var indexParams = {
    language: opts.language || 'en',
    fields: Array.isArray(opts.fields) ? opts.fields.sort() : Object.keys(opts.fields).sort()
  };

  if (opts.filter) {
    indexParams.filter = opts.filter.toString();
  }
  return 'search-' + utils.MD5(JSON.stringify(indexParams));
}

function toFieldBoosts(fields) {
  if (Array.isArray(fields)) {
    var fieldsMap = {};
    fields.forEach(function (field) {
      fieldsMap[field] = 1; // default boost
    });
    fields = fieldsMap;
  }

  return Object.keys(fields).map(function (field) {
    var deepField = field.indexOf('.') !== -1 && field.split('.');
    return {
      field: field,
      deepField: deepField,
      boost: fields[field]
    };
  });
}

//Search API
exports.search = utils.toPromise(function (opts, callback) {
  if (this.type() === 'http') {
    var self = this;
    if (opts.destroy) {
      return destroyHttpDesignDoc(this, genPersistedIndexName(opts)).then(function (result) {
        callback(null, result);
      }, callback);
    }
    search(this, opts, function (err, result) {
      //design doc is missing ?
      if (err && err.status === 404) {
        return createHttpDesignDoc(self, genPersistedIndexName(opts), opts.language,
         toFieldBoosts(opts.fields), opts.filter).then(function () {
          //try again - with the design doc in place
          search(self, opts, callback);
        }, callback);
      }
      callback(err, result);
    });
  } else {
    search(this, opts, callback);
  }
});

function search(pouch, opts, callback) {
  opts = utils.extend(true, {}, opts);
  var q = opts.query || opts.q;
  var mm = 'mm' in opts ? (parseFloat(opts.mm) / 100) : 1; // e.g. '75%'
  var highlighting = opts.highlighting;
  var includeDocs = opts.include_docs;
  var destroy = opts.destroy;
  var stale = opts.stale;
  var limit = opts.limit;
  var build = opts.build;
  var skip = opts.skip || 0;
  var language = opts.language || 'en';
  var filter = opts.filter;

  var fieldBoosts = toFieldBoosts(opts.fields);

  var index = indexes[language];
  if (!index) {
    index = indexes[language] = lunr();
    if (language !== 'en') {
      index.use(global.lunr[language]);
    }
  }

  var persistedIndexName = genPersistedIndexName(opts);

  var mapFun;

  if (pouch.type() === 'http') {
    mapFun = persistedIndexName;
  } else {
    mapFun = createMapFunction(fieldBoosts, index, filter, pouch);
  }

  var queryOpts = {
    saveAs: persistedIndexName
  };
  if (destroy) {
    queryOpts.destroy = true;
    return pouch._search_query(mapFun, queryOpts, callback);
  } else if (build) {
    delete queryOpts.stale; // update immediately
    queryOpts.limit = 0;
    pouch._search_query(mapFun, queryOpts).then(function () {
      callback(null, {ok: true});
    }).catch(callback);
    return;
  }

  // it shouldn't matter if the user types the same
  // token more than once, in fact I think even Lucene does this
  // special cases like boingo boingo and mother mother are rare
  var queryTerms = uniq(getTokenStream(q, index));
  if (!queryTerms.length) {
    return callback(null, {rows: []});
  }
  queryOpts.keys = queryTerms.map(function (queryTerm) {
    return TYPE_TOKEN_COUNT + queryTerm;
  });

  if (typeof stale === 'string') {
    queryOpts.stale = stale;
  }

  // search algorithm, basically classic TF-IDF
  //
  // step 1: get the doc+fields associated with the terms in the query
  // step 2: get the doc-len-norms of those document fields
  // step 3: calculate document scores using tf-idf
  //
  // note that we follow the Lucene convention (established in
  // DefaultSimilarity.java) of computing doc-len-norm (in our case, tecnically
  // field-lennorm) as Math.sqrt(numTerms),
  // which is an optimization that avoids having to look up every term
  // in that document and fully recompute its scores based on tf-idf
  // More info:
  // https://lucene.apache.org/core/3_6_0/api/core/org/apache/lucene/search/Similarity.html
  //

  // step 1
  pouch._search_query(mapFun, queryOpts).then(function (res) {

    if (!res.rows.length) {
      return callback(null, {rows: []});
    }

    var docIdsToFieldsToQueryTerms = {};
    var termDFs = {};

    res.rows.forEach(function (row) {
      var term = row.key.substring(1);
      var field = row.value || 0;

      // calculate termDFs
      if (!(term in termDFs)) {
        termDFs[term] = 1;
      } else {
        termDFs[term]++;
      }

      // calculate docIdsToFieldsToQueryTerms
      if (!(row.id in docIdsToFieldsToQueryTerms)) {
        var arr = docIdsToFieldsToQueryTerms[row.id] = [];
        for (var i = 0; i < fieldBoosts.length; i++) {
          arr[i] = {};
        }
      }

      var docTerms = docIdsToFieldsToQueryTerms[row.id][field];
      if (!(term in docTerms)) {
        docTerms[term] = 1;
      } else {
        docTerms[term]++;
      }
    });

    // apply the minimum should match (mm)
    if (queryTerms.length > 1) {
      Object.keys(docIdsToFieldsToQueryTerms).forEach(function (docId) {
        var allMatchingTerms = {};
        var fieldsToQueryTerms = docIdsToFieldsToQueryTerms[docId];
        Object.keys(fieldsToQueryTerms).forEach(function (field) {
          Object.keys(fieldsToQueryTerms[field]).forEach(function (term) {
            allMatchingTerms[term] = true;
          });
        });
        var numMatchingTerms = Object.keys(allMatchingTerms).length;
        var matchingRatio = numMatchingTerms / queryTerms.length;
        if ((Math.floor(matchingRatio * 100) / 100) < mm) {
          delete docIdsToFieldsToQueryTerms[docId]; // ignore this doc
        }
      });
    }

    if (!Object.keys(docIdsToFieldsToQueryTerms).length) {
      return callback(null, {rows: []});
    }

    var keys = Object.keys(docIdsToFieldsToQueryTerms).map(function (docId) {
      return TYPE_DOC_INFO + docId;
    });

    var queryOpts = {
      saveAs: persistedIndexName,
      keys: keys
    };

    // step 2
    return pouch._search_query(mapFun, queryOpts).then(function (res) {

      var docIdsToFieldsToNorms = {};
      res.rows.forEach(function (row) {
        docIdsToFieldsToNorms[row.id] = row.value;
      });
      // step 3
      // now we have all information, so calculate scores
      var rows = calculateDocumentScores(queryTerms, termDFs,
        docIdsToFieldsToQueryTerms, docIdsToFieldsToNorms, fieldBoosts);
      return rows;
    }).then(function (rows) {
      // filter before fetching docs or applying highlighting
      // for a slight optimization, since for now we've only fetched ids/scores
      return (typeof limit === 'number' && limit >= 0) ?
          rows.slice(skip, skip + limit) : skip > 0 ? rows.slice(skip) : rows;
    }).then(function (rows) {
      if (includeDocs) {
        return applyIncludeDocs(pouch, rows);
      }
      return rows;
    }).then(function (rows) {
      if (highlighting) {
        return applyHighlighting(pouch, opts, rows, fieldBoosts, docIdsToFieldsToQueryTerms);
      }
      return rows;

    }).then(function (rows) {
      callback(null, {rows: rows});
    });
  }).catch(callback);
}


// returns a sorted list of scored results, like:
// [{id: {...}, score: 0.2}, {id: {...}, score: 0.1}];
//
// some background: normally this would be implemented as cosine similarity
// using tf-idf, which is equal to
// dot-product(q, d) / (norm(q) * norm(doc))
// (although there is no point in calculating the query norm,
// because all we care about is the relative score for a given query,
// so we ignore it, lucene does this too)
//
//
// but instead of straightforward cosine similarity, here I implement
// the dismax algorithm, so the doc score is the
// sum of its fields' scores, and this is done on a per-query-term basis,
// then the maximum score for each of the query terms is the one chosen,
// i.e. max(sumOfQueryTermScoresForField1, sumOfQueryTermScoresForField2, etc.)
//

function calculateDocumentScores(queryTerms, termDFs, docIdsToFieldsToQueryTerms,
                            docIdsToFieldsToNorms, fieldBoosts) {

  var results = Object.keys(docIdsToFieldsToQueryTerms).map(function (docId) {

    var fieldsToQueryTerms = docIdsToFieldsToQueryTerms[docId];
    var fieldsToNorms = docIdsToFieldsToNorms[docId];

    var queryScores = queryTerms.map(function (queryTerm) {
      return fieldsToQueryTerms.map(function (queryTermsToCounts, fieldIdx) {
        var fieldNorm = fieldsToNorms[fieldIdx];
        if (!(queryTerm in queryTermsToCounts)) {
          return 0;
        }
        var termDF = termDFs[queryTerm];
        var termTF = queryTermsToCounts[queryTerm];
        var docScore = termTF / termDF; // TF-IDF for doc
        var queryScore = 1 / termDF; // TF-IDF for query, count assumed to be 1
        var boost = fieldBoosts[fieldIdx].boost;
        return docScore * queryScore * boost / fieldNorm; // see cosine sim equation
      }).reduce(add, 0);
    });

    var maxQueryScore = 0;
    queryScores.forEach(function (queryScore) {
      if (queryScore > maxQueryScore) {
        maxQueryScore = queryScore;
      }
    });

    return {
      id: docId,
      score: maxQueryScore
    };
  });

  results.sort(function (a, b) {
    return a.score < b.score ? 1 : (a.score > b.score ? -1 : 0);
  });

  return results;
}

function applyIncludeDocs(pouch, rows) {
  return Promise.all(rows.map(function (row) {
    return pouch.get(row.id);
  })).then(function (docs) {
    docs.forEach(function (doc, i) {
      rows[i].doc = doc;
    });
  }).then(function () {
    return rows;
  });
}

// create a convenient object showing highlighting results
// this is designed to be like solr's highlighting feature, so it
// should return something like
// {'fieldname': 'here is some <strong>highlighted text</strong>.'}
//
function applyHighlighting(pouch, opts, rows, fieldBoosts,
                           docIdsToFieldsToQueryTerms) {

  var pre = opts.highlighting_pre || '<strong>';
  var post = opts.highlighting_post || '</strong>';

  return Promise.all(rows.map(function (row) {

    return Promise.resolve().then(function () {
      if (row.doc) {
        return row.doc;
      }
      return pouch.get(row.id);
    }).then(function (doc) {
      row.highlighting = {};
      docIdsToFieldsToQueryTerms[row.id].forEach(function (queryTerms, i) {
        var fieldBoost = fieldBoosts[i];
        var fieldName = fieldBoost.field;
        var text = getText(fieldBoost, doc);
        // TODO: this is fairly naive highlighting code; could improve
        // the regex
        Object.keys(queryTerms).forEach(function (queryTerm) {
          var regex = new RegExp('(' + queryTerm + '[a-z]*)', 'gi');
          var replacement = pre + '$1' + post;
          text = text.replace(regex, replacement);
          row.highlighting[fieldName] = text;
        });
      });
    });
  })).then(function () {
    return rows;
  });
}

// return true if filtered, false otherwise
// limit the try/catch to its own function to avoid deoptimization
function isFiltered(doc, filter, db) {
  try {
    return !!(filter && !filter(doc));
  } catch (e) {
    db.emit('error', e);
    return true;
  }
}

function genIsFilteredForDesignDoc() {
  return "function (doc, filter){ \n" +
  "try {\n" +
  "  return !!(filter && !filter(doc));\n" +
  "} catch (e) {\n" +
  "  return true;\n" +
  "}\n" +
  "}";
}

function genGetTextForDesignDoc() {
  return "function (fieldBoost, doc) { \n" +
  "var text; \n" +
  "if (!fieldBoost.deepField) { \n" +
  "  text = doc[fieldBoost.field]; \n" +
  "} else { \n" +
  "  text = doc; \n" +
  "  for (var i = 0, len = fieldBoost.deepField.length; i < len; i++) { \n" +
  "    text = text && text[fieldBoost.deepField[i]]; \n" +
  "  } \n" +
  "} \n" +
  "if (text) { \n" +
  "  if (Array.isArray(text)) { \n" +
  "    text = text.join(' '); \n" +
  "  } else if (typeof text !== 'string') { \n" +
  "    text = text.toString(); \n" +
  "  } \n" +
  "}\n" +
  "return text;\n" +
  "}";
}

//create the design doc, including the libs (lunr.js + helper functions)
function createHttpDesignDoc(db, name, language, fieldBoosts, filter) {

  //Read the lib files from disk asynchronously
  return new Promise(function (resolve, reject) {
    var body = {
      language: 'javascript',
      views: {
        lib: {
          fieldBoosts: "exports.fieldBoosts = " + JSON.stringify(fieldBoosts),
          getText: 'exports.getText = ' + genGetTextForDesignDoc(),
          isFiltered: 'exports.isFiltered = ' + genIsFilteredForDesignDoc(),
          filter: 'exports.filter = ' + filter
        }
      }
    };

    //libs stored in couchdb_libs folder
    var libFiles = [{
      file: __dirname + '/node_modules/lunr/lunr.min.js',
      saveAs: 'lunr'
    }];
    if (language && language !== 'en') {
      libFiles.push({
        file: __dirname + '/http_libs/stemmerSupport.js',
        saveAs: 'stemmerSupport',
        prefix: 'var lunr = require("./lunr");\n'
      });
      libFiles.push({
        file: __dirname + '/http_libs/lunr-' + language + '.js',
        saveAs: 'lunr_lang',
        prefix: 'var lunr = require("./lunr"); ' +
        'var stemmerSupport = require("./stemmerSupport");\n'
      });
      body.views.lib.getTokenStream = "var lunr = require('./lunr'); " +
      "require('./lunr_lang'); var index = lunr();  index.use(lunr." +
        language + "); " +
        "exports.getTokenStream = function(text) { " +
        "return index.pipeline.run(lunr.tokenizer(text)); }";
    } else {
      body.views.lib.getTokenStream =
        "var lunr = require('views/lib/lunr'); var index = lunr(); " +
        "exports.getTokenStream = " +
        "function(text) { return index.pipeline.run(lunr.tokenizer(text)); }";
    }

    //map function
    body.views[name] = {
      map: 'function (doc) {\n' +
        'var isFiltered = require("views/lib/isFiltered").isFiltered;\n' +
        'var filter = require("views/lib/filter").filter;\n' +
        'if (isFiltered(doc, filter)) {\n' +
        '  return;\n' +
        '}\n' +
        'var TYPE_TOKEN_COUNT = "a";\n' +
        'var TYPE_DOC_INFO = "b";\n' +
        'var docInfo = [];\n' +
        'var fieldBoosts = require("views/lib/fieldBoosts").fieldBoosts;\n' +
        'var getText = require("views/lib/getText").getText;\n' +
        'var getTokenStream = require("views/lib/getTokenStream").getTokenStream;\n' +
        'for (var i = 0, len = fieldBoosts.length; i < len; i++) {\n' +
        '  var fieldBoost = fieldBoosts[i];\n' +
        '  var text = getText(fieldBoost, doc);\n' +
        '  var fieldLenNorm;\n' +
        '  if (text) {\n' +
        '    var terms = getTokenStream(text);\n' +
        '    for (var j = 0, jLen = terms.length; j < jLen; j++) {\n' +
        '      var term = terms[j];\n' +
        '      var value = fieldBoosts.length > 1 ? i : undefined;\n' +
        '      emit(TYPE_TOKEN_COUNT + term, value);\n' +
        '    }\n' +
        '    fieldLenNorm = Math.sqrt(terms.length);\n' +
        '  } else { \n' +
        '    fieldLenNorm = 0;\n' +
        '  }\n' +
        '  docInfo.push(fieldLenNorm);\n' +
        '}\n' +
        'emit(TYPE_DOC_INFO + doc._id, docInfo);\n' +
      '}'
    };

    //read libs from disk
    readLibFiles(libFiles, function (err, result) {
      /* istanbul ignore if */
      if (err) {
        return reject(err);
      }
      for (var lib in result) {
        //append the file content to the view definition
        body.views.lib[lib] = result[lib];
      }
      resolve(body);
    });
  }).then(function (body) {
    //add the design document
    return db.request({
      method: 'PUT',
      url: '_design/' + name,
      body: body
    });
  });
}

function destroyHttpDesignDoc(db, name) {
  var docId = '_design/' + name;
  return db.get(docId).then(function (doc) {
    return db.remove(docId, doc._rev);
  });
}

//read from disk
function readLibFiles(files, cb) {
  var fs = require('fs');
  /* istanbul ignore if */
  if (!fs) {
    return cb({
      error: "fs is missing"
    });
  }
  var result = {};
  var iterFiles = function (i) {
    if (i < files.length) {
      var fileDesc = files[i];
      fs.readFile(fileDesc.file, {
        encoding: 'utf8'
      }, function (err, content) {
        /* istanbul ignore if */
        if (err) {
          return cb(err);
        }
        result[fileDesc.saveAs] = fileDesc.prefix ? fileDesc.prefix + content : content;
        iterFiles(i + 1);
      });
    } else {
      cb(null, result);
    }
  };
  iterFiles(0);
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
