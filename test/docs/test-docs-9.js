'use strict';

var docs = [
  {
    _id: '1',
    list: ['much', 'text', 'goes', 'in this array, you see']
  },
  {
    _id: '2',
    nested: {
      array: [{
        aField: 'something'
      }]
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
    nested: {
      foo: null
    }
  },
  {
    _id: '8',
    nested: {
      array: null
    }
  },
  {
    _id: '9',
    nested: {
      array: []
    }
  },
  {
    _id: '10',
    nested: {
      array: [{
        aField: 'something else'
      },{
        aField: 'something different'
      },{
        aField: 'foobar'
      }]
    }
  }
];

module.exports = docs;