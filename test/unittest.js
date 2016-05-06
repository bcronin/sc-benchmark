'use strict';

global.expect = require('chai').expect;

const Suite = require('..').Suite;
const Util = require('..').Util;

function makeTestSuite() {
    return new Suite({
        passes              : 1,
        quiet               : true,
        testDurationMillis  : 50,
        primeDurationMillis : 8,
    });
}

describe('Suite', function() {
    it('should have correct stats for a fixed time test', function(done) {
        let s = makeTestSuite();
        s.bench('fixed', (N) => {
            for (let i = 0; i < N; i++) {
                Util.busyWait(10.0);
            }
        });
        s.run(() => {
            let r = Util.testsByName(s);
            expect(r['fixed']._min).gte(10.0 * 1e6);
            expect(r['fixed']._max).lte(15.0 * 1e6);
            done();
        });
    });

    it('should reset the timer on start.timer() calls', function(done) {
        let s = makeTestSuite();
        s.bench('fixed', (N, t) => {
            Util.busyWait(10.0);
            t.start();
            for (let i = 0; i < N; i++) {
                Util.busyWait(10.0);
            }
        });
        s.run(() => {
            let r = Util.testsByName(s);
            expect(r['fixed']._min).gte(10.0 * 1e6);
            expect(r['fixed']._max).lte(15.0 * 1e6);
            done();
        });
    });
});
describe('Timer', function() {
    it('should pass a valid Timer to the benchmark', function(done) {
        let s = makeTestSuite();
        s.bench('fixed', (N, t) => {

            expect(t.N).to.be.a('number');
            expect(t.start).to.be.a('function');

            t.start();
            for (let i = 0; i < N; i++) {
                Util.busyWait(1.0);
            }
        });
        s.run(done);
    });
});
