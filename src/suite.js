'use strict';

const async = require('async');
const sprintf   = require('sprintf-js').sprintf;
const Histogram = require('native-hdr-histogram');
const fs = require('fs');

/**
 * The Timer object is passed to each benchmark with helpers for properly
 * timing the benchmark.
 */
class Timer {
    constructor(N, start) {
        this._N = N;
        this._start = start;
    }

    /**
     * Returns the number of iterations to run the code to be benchmarked.
     *
     * @return {number} - The number of iterations that the benchmark should run
     *      the code to be benchmarked.
     */
    get N() {
        return this._N;
    }

    /**
     * Starts the timer associated with the benchmark.  The timer starts
     * automatically at the beginning of each benchmark functions, so this
     * effectively allows the timing to be restarted after initial setup code
     * that should not be part of the timing.
     */
    start() {
        this._start();
    }
}

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
        let timer = new Timer(N, () => { start = process.hrtime() });

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
            '%32s %15s %5s | %9s %9s %7s %5s %7s %7s %7s %10s\n' +
            '-----------------------------------------------------------------------------------------------------------------------------',
            'benchmark',
            'p98',
            'mag',
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
        let p98 = this._results.percentile(98) * factor;
        let p99 = this._results.percentile(99) * factor;
        let stddev = this._results.stddev() * factor;
        let mean = this._results.mean() * factor;
        let log = Math.log10(this._results.percentile(98));

        // https://en.wikipedia.org/wiki/Coefficient_of_variation
        let coefficientOfVariation = (stddev / mean);

        return sprintf(
            '%32s %9.2f %s/op %5.1f | %9.2f %9.2f %7.2f %5.2f %7.2f %7.2f %7.2f %10d',
            this._name,
            p98,
            units,
            log,
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

/**
 * Suite represents a suite of individual benchmarks.
 *
 * This is the primary interface for setting up the benchmarks.
 */
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

    /**
     * Adds a named benchmark.
     *
     * @param {string} name - Name of the benchmark
     * @param {function(N:number, timer:Object)} f - Benchmark function. The benchmark
     *      functions should contain a for loop that runs the code to benchmark
     *      N times.  The timer Object can optionally be used to defer the start
     *      of the timing until initialization is done.
     * @return {void}
     */
    bench(name, f) {
        this._tests.push(new Test(name, f, this._options));
        return this;
    }

    /**
     * Starts running the benchmarks.
     *
     * @param {function(err:Object)} done - Callback called when the benchmarks
     *      are complete.
     * @return {void}
     */
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
            }, () => it()),
            (it) => {
                if (!fs.existsSync('dist/benchmark-results.json') ||
                    !fs.existsSync('package.json')) {
                    it();
                    return;
                }

                let baseline = this._tests[0]._results.percentile(80);
                let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                let results = JSON.parse(fs.readFileSync('dist/benchmark-results.json', 'utf8'));
                for (let i = 0; i < this._tests.length; i++) {
                    let t = this._tests[i];
                    let p80 = t._results.percentile(80);
                    let n = p80 / baseline;
                    let m = Math.log10(n);
                    results[t._name] = results[t._name] || {};
                    results[t._name][pkg.version] = results[t._name][pkg.version] || [];
                    results[t._name][pkg.version].push(m);
                }
                fs.writeFileSync('dist/benchmark-results.json', JSON.stringify(results, null, 4));
                it();
            },
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

/*
 * Internal utilities used by the source itself and the unit tests.  No part of
 * the supported public API.
 */
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
