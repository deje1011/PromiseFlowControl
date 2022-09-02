'use strict';

var Promise = require('bluebird');
var _ = require('lodash');

var PFCError = function (errorTemplate, data) {
    var error = new Error('PFC Error: ' + errorTemplate.name + ' (' + _.toString(data) + ')');
    error.code = errorTemplate.code;
    error.data = data;
    return error;
};  

var PFC = {

    ERRORS: {
        NON_EXISTENT_DEPENDENCIES: {
            code: 0,
            name: 'Non existent dependencies',
        },
        CYCLIC_DEPENDENCIES: {
            code: 1,
            name: 'Cyclic dependencies',
        }
    },

    props: props
};

/**
    @param {Object} flowConfig An object containing functions and their dependencies.
    @returns {Promise} Promise that resolves in an object containing all results.
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

    // Reducing ['depA', 'depB'] => {depA: resultOfDepA, debB: resultOfDepB}
    var getResultsOfDependencies = function (identifiers) {
        return _.reduce(identifiers, function (results, identifier) {
            results[identifier] = identifierToResultsStore[identifier];
            return results;
        }, {});
    };

    var processTask = function (fnOrArray, identifier) {

        // If we did not get passed an array, make it one
        if (_.isArray(fnOrArray) === false) {
            fnOrArray = [fnOrArray];
        }

        // If dependencies are passed, the function gets passed as the last object in the array
        var fn = _.last(fnOrArray);
        var dependencies = fnOrArray.slice(0, fnOrArray.length - 1);

        // If last item in the array is not a function, we treat it as the result of this process
        // That way you can pass in something like {foo : 'bar'}
        if (_.isFunction(fn) === false) {
            fn = _.constant(fn);
        }

        // Check if all dependencies exist
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

        // Note: _.every also returns true for empty arrays
        var allDependenciesAreResolved = _.every(dependencies, function (dependencyIdentifier) {
            return identifierHasBeenResolvedStore[dependencyIdentifier] === true;
        });

        // If there are unresolved dependencies we have to filter out the unmet dependencies 
        // and resolve them before we can finally call our function
        if (allDependenciesAreResolved === false) {
            return Promise
                .resolve(dependencies)
                .filter(function (dependencyIdentifier) {
                    // Don't compare to false here, as the value might be undefined for unseen identifiers
                    return identifierHasBeenResolvedStore[dependencyIdentifier] !== true;
                })
                // Now we have all unresolved dependencies
                .map(function (dependencyIdentifier) {
                    return processTask(flowConfig[dependencyIdentifier], dependencyIdentifier);
                }, {concurrency: concurrency})
                // Now all dependencies are resolved
                .then(function() {
                    // After our dependencies are resolved, we just call processTask again
                    // This time allDependenciesAreResolved will be true
                    return processTask(fnOrArray, identifier);
                });
        }

        // If all dependencies are resolved, we can call the provided function with the resolved 
        // results of the dependencies
        identifierToPromiseStore[identifier] = 
            identifierToPromiseStore[identifier] || // Prevent calling functions twice by checking for identifierToPromiseStore first
            Promise.try(function () {
                return fn(getResultsOfDependencies(dependencies));
            });

        return identifierToPromiseStore[identifier].then(function (result) {

            // Save result for other functions that have this function as a dependency
            identifierToResultsStore[identifier] = result;
            identifierHasBeenResolvedStore[identifier] = true;

            // Final return
            // It does not matter what we return here, as the last .then callback in the chain
            // will get the results from the identifierToResultsStore store.
            return undefined;
        });

    };

    var identifiers = _.keys(flowConfig);
    return Promise
        .map(identifiers, function (identifier) {
            return processTask(flowConfig[identifier], identifier);
        }, {concurrency: concurrency})
        .then(function () {
            return getResultsOfDependencies(identifiers);
        });
};


module.exports = PFC;
