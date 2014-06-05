'use strict';
var docs = [];
for (var i = 0; i < 20; i++) {
  docs.push({
    _id: 'yoshi_' + i,
    title: 'This title is about Yoshi'
  });

  docs.push({
    _id: 'mario_' + i,
    title: 'This title is about Mario'
  });

  // earlier ones are more strongly weighted
  for (var j = 0; j < (20 - i); j++) {
    docs[docs.length - 2].title += ' Yoshi';
    docs[docs.length - 1].title += ' Mario';
  }
}

module.exports = docs;
