# sc-benchmark

[![npm version](https://badge.fury.io/js/sc-benchmark.svg)](https://badge.fury.io/js/sc-benchmark)
[![Circle CI](https://circleci.com/gh/bcronin/sc-benchmark.svg?style=shield)](https://circleci.com/gh/bcronin/sc-benchmark)

A package for benchmarking functions.

Inspired somewhat by the [Go testing package](https://golang.org/pkg/testing/).

## Install

```
npm install --save sc-benchmark
```

## Usage

```javascript
const Suite = require('sc-benchmark').Suite;

let s = new Suite();

// Add a named benchmark.  Note that the argument `N` passed to the callback
// function to run the test: the function should always include a for loop that
// runs the test N times. This is done *inside* the test rather than as part of
// the framework to reduce function call overhead.
s.bench('sqrt', (N) => {
    for (let i = 0; i < N; i++) {
        Math.sqrt(42);
    }
});

// Optionally, the test can use the second `timer` object argument. Currently,
// it has a single method `start()` which tells the test when to start timing.
// This allows the test to do up front setup outside of the timed section of
// code.  If timer.start() is not called, the timing information implicitly
// starts as soon as the test function begins.
s.bench('sha1', (N, timer) => {
    let crypto = require('crypto');
    let content = '';
    for (let i = 0; i < 256; i++) {
        content += 'Hello world!\n';
    }

    timer.start();
    for (let i = 0; i < N; i++) {
        let shasum = crypto.createHash('sha1');
        shasum.update(content);
        shasum.digest('hex');
    }
});
```
