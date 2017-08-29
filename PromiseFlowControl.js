'use strict';

var Promise = require('bluebird');
var _ = require('lodash');

/*
    Things to create issues for: https://github.com/dtao/autodoc/issues
    * Wrong Line Number when test fails + no error message 
        https://github.com/dtao/autodoc/issues/57
    * No indentation 
        https://github.com/dtao/autodoc/issues/56
    * How to handle the promise.reject case properly
        https://github.com/dtao/autodoc/issues/58
*/



var PFCError = function (error, data) {
    return {
        code : error.code,
        name : 'PFC Error: ' + error.name,
        message : error.message || error.name,
        data : data
    };
};  

var PFC = {

    ERRORS : {
        NON_EXISTENT_DEPENDENCIES : {
            code : 0,
            name : 'Non existent dependencies',
            message : ''
        },
        CYCLIC_DEPENDENCIES : {
            code : 1,
            name : 'Cyclic dependencies',
            message : ''
        }
    },

    props : props
};


/**
    @param {Object} flowConfig An object containing functions and their dependencies.
    @returns {Promise} Promise that resolves in an object containing all results.
    @examples
    
    // Setup
    var extractErrorCode = function(e) { return Promise.reject(e.code) };
    
    
    // Test 1 "Success"
    var flowConfigSuccess = {
        syncProp : 'sync prop',
        syncFn : function () {
            return 'sync fn';
        },
        asyncFn : function () {
            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    resolve('async fn');
                }, 1);
            });
        },
        dependencyFn: ['syncFn', 'asyncFn', function (results) {
            return results.syncFn + ' - ' + results.asyncFn;
        }]
    };
    
    var expectedResult = {
        syncProp : 'sync prop',
        syncFn : 'sync fn',
        asyncFn : 'async fn',
        dependencyFn : 'sync fn - async fn'
    };
    
    // Test 2 "Non existent dependencies"
    var flowConfigNonExistentDep = {
        a : ['b', function () {}]
    };
    var nonExistentDep_errorCode = PFC.ERRORS.NON_EXISTENT_DEPENDENCIES.code;
    
    
    // Test 3 "cyclic dependencies"
    var flowConfigCyclicDeps = {
        a : ['b', function () {}],
        b : ['a', function () {}]
    };
    var cyclicDeps_errorCode = PFC.ERRORS.CYCLIC_DEPENDENCIES.code;
    
    
    // Run tests
    PFC.props(flowConfigSuccess) // resolves in expectedResult
    PFC.props(flowConfigNonExistentDep).catch(extractErrorCode) // rejects with nonExistentDep_errorCode
    PFC.props(flowConfigCyclicDeps).catch(extractErrorCode) // rejects with cyclicDeps_errorCode
*/
function props (flowConfig, concurrency) {
    
    // By setting concurrency to n, you restrict PFC.props to only run n functions at the same time
    concurrency = _.isInteger(concurrency) && concurrency > 0 ? concurrency : Infinity;

    // We need to have two different stores here because one of the functions could 
    // return "undefined", which we can not differenciate from an unmet dependency.
    var identifierHasBeenResolvedStore = {};
    var identifierToResultsStore = {};
    
    // Prevent calling a function twice: 
    var identifierToPromiseStore = {};

    var mapIdentifiersToResults = function (identifiers) {
        return _.reduce(identifiers, function (results, identifier) {
            results[identifier] = identifierToResultsStore[identifier];
            return results;
        }, {});
    };

    var processTask = function (fnOrArray, identifier) {

        // if we did not get passed an array, make it one
        if (_.isArray(fnOrArray) === false) {
            fnOrArray = [fnOrArray];
        }

        // If dependencies are passed, the function gets passed as the last object in the array
        var fn = _.last(fnOrArray);
        var dependencies = fnOrArray.slice(0, fnOrArray.length - 1);

        // If last item in the array is not a function, we treat it as the result of this process
        // That way you can pass in something like {foo : 'bar'}
        if (_.isFunction(fn) === false) {
            var syncPropResult = fn;
            fn = _.constant(syncPropResult);
        }


        // check if all dependencies exist
        var nonExistentDependencies = _.filter(dependencies, function (dependencyIdentifier) {
            return flowConfig[dependencyIdentifier] === undefined; 
        });

        if (nonExistentDependencies.length > 0) {
            return Promise.reject(PFCError(PFC.ERRORS.NON_EXISTENT_DEPENDENCIES, nonExistentDependencies));
        } 

        // Check for cyclic dependencies
        var cycylicDependencies = _.filter(dependencies, function (dependencyIdentifier) {
            var config = flowConfig[dependencyIdentifier];
            return _.isArray(config) && config.indexOf(identifier) !== -1;
        });

        if (cycylicDependencies.length > 0) {
            return Promise.reject(PFCError(PFC.ERRORS.CYCLIC_DEPENDENCIES, cycylicDependencies));
        }


        // _.every also returns true for empty arrays, so we are save here 
        var allDependenciesAreResolved = _.every(dependencies, function (dependencyIdentifier) {
            return identifierHasBeenResolvedStore[dependencyIdentifier] === true;
        });

        // If all dependencies are resolved, we can call the provided function with the resolved 
        // results of the dependencies
        if (allDependenciesAreResolved === true) {
            // (*1*) 

            // Reducing ["depA", "depB] => {depA : resultOfDepA, debB : resultOfDepB}
            var resultsParam = mapIdentifiersToResults(dependencies);
            
            // Prevent calling functions twice
            var resultPromise = identifierToPromiseStore[identifier] || Promise.try(function () {
                return fn(resultsParam);
            });
            identifierToPromiseStore[identifier] = resultPromise;

            return resultPromise.then(function (result) {

                // Save result for other functions that have this function as a dependency
                identifierToResultsStore[identifier] = result;
                identifierHasBeenResolvedStore[identifier] = true;

                // Final return
                // It does not matter what we return here, as the last .then callback in the chain
                // will get the results from the identifierToResultsStore store.
                return undefined;
            });
        } else {

            // Otherwise we have to filter out the unmet dependencies and resolve them before 
            // we can finally call our function
            var unresolvedDependencies = _.filter(dependencies, function (dependencyIdentifier) {
                // don't compare to false here, as the value might be undefined for unseen identifiers
                return identifierHasBeenResolvedStore[dependencyIdentifier] !== true;
            });

            var processTaskForIdentifier = function (dependencyIdentifier) {
                return processTask(flowConfig[dependencyIdentifier], dependencyIdentifier);
            };

            return Promise.map(unresolvedDependencies, processTaskForIdentifier, {concurrency: concurrency}).then(function() {
                // After our unmet dependencies are resolved, we  just call process task again
                // This time it will return the result from (*1*)
                return processTask(fnOrArray, identifier);
            });
        }

    };

    var allIdentifierParams = _.keys(flowConfig);

    return Promise.map(allIdentifierParams, function (identifier) {
        return processTask(flowConfig[identifier], identifier);
    }, {concurrency: concurrency}).then(function () {
        return mapIdentifiersToResults(allIdentifierParams);
    });

};


module.exports = PFC;
