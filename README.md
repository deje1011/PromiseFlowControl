# PromiseFlowControl
This library basically provides the same functionality as [async.auto](http://caolan.github.io/async/docs.html#auto) but for [bluebird](http://bluebirdjs.com/) promises.

You can pass functions that should be executed and define dependencies that need to be resolved before execution.

This solves the problem of a promise chain loosing context. Consider the following example:
```javascript
getUsers()
    .then(users => {
        const owner = users.find(user => user.isOwner);
        return getMoreUserInfo(owner);
    })
    .then(moreInfo => {
        console.log(moreInfo);
        console.log(users); // How to access users here?
    })

```

```javascript
PFC
    .props({

        users: () => getUsers(),

        owner: ['users', ({users}) => users.find(user => user.isOwner)]

        moreInfo: ['owner', ({owner}) => getMoreUserInfo(owner)],
        
        logUsersAndInfo: ['users', 'moreInfo', ({users, moreInfo}) => {
            console.log(moreInfo);
            console.log(users);
        }]
    })
```

# Supported values

You can pass values, functions that return synchronously and functions that return promises.

```javascript
PFC
    .props({

        syncValue: 'sync value',

        syncFn: function () {
            return 'sync fn';
        },

        asyncFn: function () {
            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    resolve('async fn');
                }, 0);
            });
        },

        fnWithDependencies: ['syncFn', 'asyncFn', function (results) {
            return results.syncFn + ' + ' + results.asyncFn;
        }]

    })
    .then(function (results) {
        console.log(results); // {syncValue: 'sync value', syncFn: 'sync fn', asyncFn: 'async fn', fnWithDependencies: 'sync fn + async fn'}
    });
```

# Concurrency

By passing a number as the second argument, you can limit the number of functions that should be 
executed at the same time.

```javascript
PFC.props(flowConfig, 2); // run at most 2 functions at the same time
```

# Errors


## Non existent dependencies

In the following example, `a` requires `b` to be passed but `b` does not exist.
The returned promise will be rejected with `PFC.ERRORS.NON_EXISTENT_DEPENDENCIES`.

```javascript
PFC
    .props({
        a: ['b', function () {}]
    })
    .catch(function (err) {
        err.code === PFC.ERRORS.NON_EXISTENT_DEPENDENCIES.code // true
    })
```

## Cyclic dependencies

In the following example, `a` requires `b` and `b` requires `a`.
A loop like this cannot be resolved properly, so the returned promise will be 
rejected with `PFC.ERRORS.CYCLIC_DEPENDENCIES`.

```javascript
PFC
    .props({
        a: ['b', function () {}],
        b: ['a', function () {}]
    })
    .catch(function (err) {
        err.code === PFC.ERRORS.CYCLIC_DEPENDENCIES.code // true
    })
```

