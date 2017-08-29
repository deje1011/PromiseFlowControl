var describeFn = require('describefn');
var Promise = require('bluebird');
var PFC = require('./PromiseFlowControl');
var _ = require('lodash');


var generateConcurrencyTest = function (CONCURRENCY) {
    var numberOfRunningFunctions = 0;
    var requestFunctionRun = function () {
        if (numberOfRunningFunctions >= CONCURRENCY) {
            throw new Error('Concurrency is set to ' + CONCURRENCY + ' but more functions are running');
        }
        numberOfRunningFunctions += 1;
    };
    var releaseFunctionRun = function () {
        numberOfRunningFunctions -= 1;
    };
    return {
        params: [{
            first: function () {
                requestFunctionRun();
                return Promise.delay(10).then(releaseFunctionRun);
            },
            second: function () {
                requestFunctionRun();
                return Promise.delay(20).then(releaseFunctionRun);
            },
            third: ['first', function () {
                requestFunctionRun();
                return Promise.delay(10).then(releaseFunctionRun);
            }],
            fourth: ['first', function () {
                requestFunctionRun();
                return Promise.delay(20).then(releaseFunctionRun);
            }],
        }, CONCURRENCY],
        result: {
            isError: false
        }
    };
};

describeFn({
    fn: PFC.props,
    fnName: 'PFC.props',
    tests: {

        'can handle synchronous results': {
            params: {
                syncProp: 'sync prop',
                syncFnResult: function () {
                    return 'syncFn result';
                }
            },
            result: {
                equals: {
                    syncProp: 'sync prop',
                    syncFnResult: 'syncFn result'
                }
            }
        },

        'can handle asynchronous results': {
            params: {
                asyncFnResult: function () {
                    return new Promise(function (resolve, reject) {
                        setTimeout(function () {
                            resolve('asyncFn result');
                        }, 100);
                    });
                }
            },
            result: {
                equals: {asyncFnResult: 'asyncFn result'}
            }
        },

        'passes dependencies to a function that requires them': {
            params: {
                syncFnResult: function () {
                    return 'syncFn result';
                },
                asyncFnResult: function () {
                    return new Promise(function (resolve, reject) {
                        setTimeout(function () {
                            resolve('asyncFn result');
                        }, 0);
                    });
                },
                fnWithDeps: ['syncFnResult', 'asyncFnResult', function (results) {
                    return 'fnWithDeps: ' + results.syncFnResult + ', ' + results.asyncFnResult;
                }]
            },
            result: {
                equals: {
                    syncFnResult: 'syncFn result',
                    asyncFnResult: 'asyncFn result',
                    fnWithDeps: 'fnWithDeps: syncFn result, asyncFn result'
                }
            }
        },

        'returns a rejected promise if one of the functions returns a rejected promise': {
            params: {
                syncFnResult: function () {
                    return 'syncFn result';
                },
                asyncFnResult: function () {
                    return new Promise(function (resolve, reject) {
                        setTimeout(function () {
                            reject(new Error('asyncFn error'));
                        }, 0);
                    });
                }
            },
            result: {
                isError: true,
                contains: {message: 'asyncFn error'}
            }
        },

        'returns a rejected promise if one of the functions throws a synchronous error': {
            params: {
                syncFnResult: function () {
                    return 'syncFn result';
                },
                errorFn: function () {
                   throw new Error('sync error')
                }
            },
            result: {
                isError: true,
                contains: {message: 'sync error'}
            }
        },

        'throws an error if there are missing dependencies': {
            params: {
                fn: ['nonExistingFn', function (results) {
                    return results;
                }]
            },
            result: {
                isError: true,
                contains: {code: PFC.ERRORS.NON_EXISTENT_DEPENDENCIES.code}
            }
        },

        'throws an error if there are cyclic dependencies': {
            params: {
                fnOne: ['fnTwo', function (results) {
                    return results;
                }],
                fnTwo: ['fnOne', function (results) {
                    return results;
                }]
            },
            result: {
                isError: true,
                contains: {code: PFC.ERRORS.CYCLIC_DEPENDENCIES.code}
            }
        },
        
        'does not call functions more than once if they are required multiple times': {
            params: {
                getCounter: (function () {
                    var counter = {
                        value: 0
                    };
                    return function () {
                        counter.value += 1;
                        return counter;
                    };
                }()),
                getCounterOnce: ['getCounter', function () {}],
                getCounterTwice: ['getCounter', function () {}]
            },
            result: {
                contains: {getCounter: {value: 1}}
            }
        },
        
        'does not call functions more than ones if they throw an error': {
            params: {
                howOftenWasIncrementCalled: function () {
                    var counter = {value: 0};
                    return PFC
                        .props({
                            somethingForIncrementToRequire: _.noop,
                            increment: ['somethingForIncrementToRequire', function () {
                                counter.value += 1;
                                throw new Error('Inner map error');
                            }],
                            requireIncrement: ['increment', _.noop],
                        })
                        .catch(_.noop)
                        .then(function () {
                            return counter.value
                        });
                }
            },
            result: {
                contains: {howOftenWasIncrementCalled: 1}
            }
        },
        
        'can restrict how many functions run at the same time to 1': generateConcurrencyTest(1),
        'can restrict how many functions run at the same time to 2': generateConcurrencyTest(2)
    }
}).then(function (results) {
    console.log(JSON.stringify(results, null, 2));
});