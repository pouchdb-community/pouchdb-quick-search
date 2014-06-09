'use strict';

var docs = [
  {
    _id: '1',
    list: ['much', 'text', 'goes', 'in this array, you see']
  },
  {
    _id: '2',
    deep: {
      structure: {
        text: 'here is some copy about a squirrel'
      }
    }
  },
  {
    _id: '3',
    aNumber : 1
  },
  {
    _id: '4',
    invalid: null
  },
  {
    _id: '5',
    invalid: {}
  },
  {
    _id: '7',
    deep: {
      foo: null
    }
  },
  {
    _id: '2',
    deep: {
      structure: null
    }
  }
];

module.exports = docs;
