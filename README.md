# PromiseFlowControl
async.auto (http://caolan.github.io/async/docs.html#auto) for promises 

# Example 

    PFC.props({

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

        fnWithDeps: ['syncFn', 'asyncFn', function (results) {
            return results.syncFn + ' + ' + results.asyncFn;
        }]


    }).then(function (results) {
      console.log(results); // {syncFn: 'sync fn', asyncFn: 'async fn', fnWithDeps: 'sync fn + async fn'}
    });

For more examples, see examples.js
