'use strict';

const sprintf   = require('sprintf-js').sprintf;
const Histogram = require('native-hdr-histogram');

class Test {
    constructor(name, f) {
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

    prime() {
        // Prime the test for at least 50 ms each
        let threshold = 50 * 1e6;
        let count = 4;
        let ns;
        let actual;
        do {
            let start = process.hrtime();
            ns = this._run(count);
            let delta = process.hrtime(start);
            actual = delta[0] * 1e9 + delta[1];
            count *= 10;
        } while (actual < threshold);

        let iterations = Math.ceil(1.5e9 / ns);   // # to run in 1.5 secs
        this._N = Math.ceil(1e6 / ns);            // # to run in a millisecond
        this._K = Math.ceil(iterations / this._N);
    }

    run() {
        for (let i = 0; i < this._K; i++) {
            let ns = this._run(this._N);
            this._samples += this._N;
            this._min = (this._min < ns) ? this._min : ns;
            this._max = (this._max > ns) ? this._max : ns;
            this._results.record(ns);
        }
    }

    static header() {
        /* eslint-disable max-len */
        return sprintf(
            '%32s %15s | %9s %9s %7s %7s %7s %7s %10s\n' +
            '-----------------------------------------------------------------------------------------------------------------',
            'benchmark',
            'p98',
            'min',
            'max',
            'stddev',
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

        return sprintf(
            '%32s %9.2f %s/op | %9.2f %9.2f %7.2f %7.2f %7.2f %7.2f %10d',
            this._name,
            p98,
            units,
            min,
            max,
            stddev,
            p80,
            p95,
            p99,
            this._samples
        );
    }
}

class Suite {
    constructor() {
        this._tests = [];
    }

    bench(name, f) {
        this._tests.push(new Test(name, f));
        return this;
    }
    run() {
        /* eslint-disable no-console */

        console.log('Priming benchmarks...');
        for (let test of this._tests) {
            test.prime();
        }

        for (let i = 0; i < 5; i++) {
            console.log(`Pass ${i + 1}...`);
            console.log(Test.header());

            for (let j = 0; j < this._tests.length; j++) {
                let test = this._tests[j];
                test.run();
                console.log(test.row());
            }
            console.log();
        }
        /* eslint-enable no-console */

        return this;
    }
}

module.exports = {
    Suite : Suite,
};
