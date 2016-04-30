'use strict';

const Suite = require('..').Suite;

const SAMPLE_CONTENT = (() => {
    let s = '';
    for (let i = 0; i < 1024 * 1024; i++) {
        s += `${i}`;
    }
    return s;
})();

function makeNestedObject(c) {
    if (c === 0) {
        return 'value';
    }
    let m = {};
    for (let i = 0; i < c; i++) {
        m[`key${i}`] = makeNestedObject(c - 1);
    }
    return m;
}

let s = new Suite();

s.bench('empty_loop', (N) => {
    for (let i = 0; i < N; i++) {
        // Intentionally do nothing
    }
});
s.bench('sqrt', (N) => {
    for (let i = 0; i < N; i++) {
        Math.sqrt(42);
    }
});
s.bench('md5', (N) => {
    for (let i = 0; i < N; i++) {
        let crypto = require('crypto');
        let shasum = crypto.createHash('md5');
        shasum.update(SAMPLE_CONTENT);
        shasum.digest('hex');
    }
});
s.bench('sha1', (N, timer) => {
    let crypto = require('crypto');
    timer.start();
    for (let i = 0; i < N; i++) {
        let shasum = crypto.createHash('sha1');
        shasum.update(SAMPLE_CONTENT);
        shasum.digest('hex');
    }
});
s.bench('sha512', (N) => {
    for (let i = 0; i < N; i++) {
        let crypto = require('crypto');
        let shasum = crypto.createHash('sha512');
        shasum.update(SAMPLE_CONTENT);
        shasum.digest('hex');
    }
});
s.bench('json_stringify-4', (N, t) => {
    let obj = makeNestedObject(4);
    t.start();
    for (let i = 0; i < N; i++) {
        JSON.stringify(obj);
    }
});
s.bench('json_stringify-8', (N, t) => {
    let obj = makeNestedObject(8);
    t.start();
    for (let i = 0; i < N; i++) {
        JSON.stringify(obj);
    }
});

s.run();
