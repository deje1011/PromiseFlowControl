'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var PFC = require('./PromiseFlowControl');


var unexpectedResult = _.curry(function (name, handler, data) {
    console.log('################    !!!!!!!!      ###############');
    console.error('PFC test ' + name + ' failed: Unexpected result in handler ' + handler, data);
    console.log('################    ^^^^^^^^      ###############');
});

var testPassed = function (name) {
    console.info('PFC test ' + name + ' passed');
};


/*

*/
var syncTestName = 'sync';
PFC.props({
    syncProp : 'sync prop',
    syncFn : function () {
        return 'sync fn';
    }
}).then(function (results) {
    if (results.syncProp === 'sync prop' && results.syncFn === 'sync fn') {
        testPassed(syncTestName);
    } else {
        unexpectedResult(syncTestName, 'then', results);
    }
}).catch(unexpectedResult(syncTestName, 'catch'));


var asyncTestName = 'async';
PFC.props({
    asyncFn : function () {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                resolve('async fn');
            }, 100);
        });
    }
}).then(function (results) {
    if (results.asyncFn === 'async fn') {
        testPassed(asyncTestName);
    } else {
        unexpectedResult(asyncTestName, 'then', results);
    }
});

var mixedDependencyTestName = 'mixed deps';
PFC.props({

    syncFn : function () {
        return 'sync fn';
    },

    asyncFn : function () {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                resolve('async fn');
            }, 0);
        });
    },

    fnWithDeps : ['syncFn', 'asyncFn', function (results) {
        return results.syncFn + ' + ' + results.asyncFn;
    }]


}).then(function (results) {
    if (results.syncFn === 'sync fn' &&
        results.asyncFn === 'async fn' &&
        results.fnWithDeps === 'sync fn + async fn') {
        testPassed(mixedDependencyTestName);
    } else {
        unexpectedResult(mixedDependencyTestName, 'then', results);
    }
}).catch(unexpectedResult(mixedDependencyTestName, 'catch'));


var catchRejectionTestName = 'catch rejection';
PFC.props({
    asyncFn : function () {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                reject('async fn error');
            }, 0);
        });
    }
}).then(unexpectedResult(catchRejectionTestName, 'then')).catch(function (reason) {
    if (reason === 'async fn error') {
        testPassed(catchRejectionTestName);
    } else {
        unexpectedResult(catchRejectionTestName, 'catch', reason);
    }
});

var catchAsyncErrorTestName = 'catch error';
PFC.props({
    asyncFn : function () {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                resolve('async fn');
            }, 0);
        }).then(function () {
            throw 'async fn error';
        });
    }
}).then(unexpectedResult(catchAsyncErrorTestName, 'then')).catch(function (reason) {
    if (reason === 'async fn error') {
        testPassed(catchAsyncErrorTestName);
    } else {
        unexpectedResult(catchAsyncErrorTestName, 'catch', reason);
    }
});


var nonExistentDependencyTest = 'nonexistent dependency';
PFC.props({
    fn : ['otherFn', function (results) {
        return results;
    }]
}).then(unexpectedResult(nonExistentDependencyTest, 'then')).catch(function (error) {
    if (error && error.code === PFC.ERRORS.NON_EXISTENT_DEPENDENCIES.code) {
        testPassed(nonExistentDependencyTest);
    } else {
        unexpectedResult(nonExistentDependencyTest, 'catch', error);
    }
});


var cyclicDependencyTestName = 'cyclic dependencies';
PFC.props({
    fnOne : ['fnTwo', function (results) {
        return results;
    }],
    fnTwo : ['fnOne', function (results) {
        return results;
    }]
}).then(unexpectedResult(cyclicDependencyTestName, 'then')).catch(function (error) {
    if (error && error.code === PFC.ERRORS.CYCLIC_DEPENDENCIES.code) {
        testPassed(cyclicDependencyTestName);
    } else {
        unexpectedResult(cyclicDependencyTestName, 'catch', error);
    }
});
