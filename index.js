'use strict';

const async = require('async');
const sprintf   = require('sprintf-js').sprintf;
const Histogram = require('native-hdr-histogram');

class Test {
    constructor(name, f, opts) {
        this._name = name;
        this._func = f;
        this._min = undefined;
        this._max = undefined;
        this._N = undefined;
        this._K = undefined;
        this._samples = 0;
        this._results = new Histogram(1, 1e9, 3);
    }

    _run(N) {
        let start = null;
        let timer = {
            N     : N,
            start : () => { start = process.hrtime(); },
        };

        start = process.hrtime();
        this._func(N, timer);
        let delta = process.hrtime(start);

        // Convert to nanoseconds/op
        let ns = delta[0] * (1e9 / N) + delta[1] / N;
        return ns;
    }

    prime(opts) {
        let durationNanos = opts.testDurationMillis * 1e6;

        // Prime the test for at least the desired time
        let threshold = opts.primeDurationMillis * 1e6;
        let count = 2;
        let ns;
        let actual;
        do {
            let start = process.hrtime();
            ns = this._run(count);
            let delta = process.hrtime(start);
            actual = delta[0] * 1e9 + delta[1];
            if (threshold / actual > 10) {
                count *= 10;
            } else {
                count *= 2;
            }
        } while (actual < threshold);

        // Compute the number of times that we want to run the test, then split
        // that between K samples of N iterations each.  Ensure each sample is
        // of at least a millisecond of run time.
        let iterations = Math.ceil(durationNanos / ns);
        this._N = Math.ceil(1e6 / ns);    // # to run in a millisecond
        this._K = Math.ceil(iterations / this._N);
    }

    run(opts, done) {
        async.timesSeries(this._K, (i, next) => {
            let ns = this._run(this._N);
            this._samples += this._N;
            this._min = (this._min < ns) ? this._min : ns;
            this._max = (this._max > ns) ? this._max : ns;
            this._results.record(ns);
            process.nextTick(next);
        }, done);
    }

    static header() {
        /* eslint-disable max-len */
        return sprintf(
            '%32s %15s | %9s %9s %7s %5s %7s %7s %7s %10s\n' +
            '-----------------------------------------------------------------------------------------------------------------------',
            'benchmark',
            'p98',
            'min',
            'max',
            'stddev',
            'CV',
            'p80',
            'p95',
            'p99',
            'samples'
        );
        /* eslint-enable max-len */
    }

    row() {
        let min = this._min;
        let max = this._max;
        let factor = 1.0;
        let units = 'ns';

        if (min > 1.5e6) {
            units = 'ms';
            factor = 1.0 / 1e6;
        } else if (min > 1.5e3) {
            units = 'us';
            factor = 1.0 / 1e3;
        }

        min *= factor;
        max *= factor;
        let p80 = this._results.percentile(80) * factor;
        let p95 = this._results.percentile(95) * factor;
        let p98 = this._results.percentile(99) * factor;
        let p99 = this._results.percentile(99) * factor;
        let stddev = this._results.stddev() * factor;
        let mean = this._results.mean() * factor;

        // https://en.wikipedia.org/wiki/Coefficient_of_variation
        let coefficientOfVariation = (stddev / mean);

        return sprintf(
            '%32s %9.2f %s/op | %9.2f %9.2f %7.2f %5.2f %7.2f %7.2f %7.2f %10d',
            this._name,
            p98,
            units,
            min,
            max,
            stddev,
            coefficientOfVariation,
            p80,
            p95,
            p99,
            this._samples
        );
    }
}

class Suite {

    /**
     * @param opts For internal use only.
     */
    constructor(opts) {
        this._tests = [];
        this._options = {
            passes              : 5,
            quiet               : false,
            testDurationMillis  : 1500,
            primeDurationMillis : 50,
        };

        if (opts) {
            for (let key in opts) {
                if (typeof this._options[key] === 'undefined') {
                    throw new Error('Unknown option');
                }
            }
            for (let key in this._options) {
                if (opts[key] === undefined) {
                    continue;
                }
                if (typeof opts[key] !== typeof this._options[key]) {
                    throw new Error('Option typeof does not match');
                }
                this._options[key] = opts[key];
            }
        }
    }

    bench(name, f) {
        this._tests.push(new Test(name, f, this._options));
        return this;
    }

    run(done) {
        done = done || function () {};

        // Run asynchronously so there's less chance of interruption during
        // tests.
        async.waterfall([
            (it) => {
                this._print('Priming benchmarks...');
                it();
            },
            (it) => async.eachSeries(this._tests, (test, jt) => {
                test.prime(this._options);
                process.nextTick(jt);
            }, it),
            (it) => async.timesSeries(this._options.passes, (i, jt) => {
                this._print(`Pass ${i + 1}...`);
                this._print(Test.header());
                async.eachSeries(this._tests, (test, kt) => {
                    test.run(this._options, () => {
                        this._print(test.row());
                        process.nextTick(kt);
                    });
                }, () => {
                    this._print();
                    jt();
                });
            }, it),
        ], done);
        return this;
    }

    _print() {
        if (!this._options.quiet) {
            /* eslint-disable no-console */
            console.log.apply(console, arguments);
            /* eslint-enable no-console */
        }
    }
}

class Util {
    static busyWait(ms) {
        let start = process.hrtime();
        let delta;
        do {
            let t = process.hrtime(start);
            delta = t[0] * 1e3 + t[1] / 1e6;
        } while (delta < ms);
    }

    static testsByName(suite) {
        let m = {};
        for (let test of suite._tests) {
            m[test._name] = test;
        }
        return m;
    }
}


module.exports = {
    Suite : Suite,
    Util  : Util,
};
