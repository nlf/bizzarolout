var Async = require('async');
var Hoek = require('hoek');
var sorrow = require('./sorrow.js');
var routeParser = require('./routeParser.js');

var internals = {};
internals.factory = function (server, options) {

    this.server = server;
    this.table = routeParser.getConnectionsData(server)[0].table;
    this.log = server.log.bind(server);
    this.iterations = options.iterations || 100;

    if (typeof options.credentials === 'function') {
        this.waiting = true;
        options.credentials(function (err, credentials) {

            if (err) {
                throw err;
            }

            this.credentials = credentials;
            this.waiting = false;
        }.bind(this));
    }
    else {
        this.credentials = options.credentials;
    }
};

internals.factory.prototype.seed = function (param) {

    var type = param.type !== undefined ? param.type.toLowerCase() : 'string';
    return sorrow[type];
};

internals.factory.prototype.fuzzParam = function (param) {

    return encodeURIComponent(this.seed(param));
};

internals.factory.prototype.fuzz = function (callback) {

    var self = this;
    if (self.waiting) {
        return setTimeout(function () {

            self.fuzz(callback);
        }, 100);
    }

    this.startTime = process.hrtime();
    this.errorCount = 0;
    self.log(['bizzarolout', 'begin'], 'starting to fuzz server');

    var table = self.table.filter(function (route) {
        return Hoek.reach(route, 'queryParams.children') ||
            Hoek.reach(route, 'payloadParams.children') ||
            Hoek.reach(route, 'pathParams.children');
    });

    Async.eachLimit(table, 2, function (route, next) {

        var params = {
            query: Hoek.reach(route, 'queryParams.children', { default: [] }),
            path: Hoek.reach(route, 'pathParams.children', { default: [] }),
            payload: Hoek.reach(route, 'payloadParams.children', { default: [] })
        };

        self.log(['bizzarolout', 'start'], route.path);

        if (!route.auth) {
            self.log(['bizzarolout', 'warning'], route.path + ' is unauthenticated');
        };

        var generateFuzz = function () {

            var fuzzed = {
                method: route.method,
                url: route.path,
                credentials: self.credentials,
                payload: params.payload.length > 0 ? {} : undefined
            };

            params.query.forEach(function (param) {

                fuzzed.url += (fuzzed.url.indexOf('?') !== -1 ? '&' : '?') + param.name + '=' + self.fuzzParam(param);
            });

            params.path.forEach(function (param) {

                var re = new RegExp('{' + param.name + '[\?\*]?}');
                fuzzed.url = fuzzed.url.replace(re, self.fuzzParam(param));
            });

            params.payload.forEach(function (param) {

                fuzzed.payload[param.name] = self.fuzzParam(param);
            });

            return fuzzed;
        };

        var results = [];
        for (var i = 0, l = self.iterations; i < l; ++i) {
            results.push({});
        }

        var i = 0;

        Async.eachLimit(results, 2, function (result, next) {

            setImmediate(function () {
                var fuzzed = generateFuzz();
                self.server.inject(fuzzed, function (res) {

                    var response = {
                        statusCode: res.statusCode,
                        payload: res.response,
                        request: fuzzed
                    };

                    delete response.request.credentials;

                    if (res.statusCode > 400 &&
                        res.statusCode !== 404) {

                        ++self.errorCount;
                        self.log(['bizzarolout', 'error'], route.path + ' got an error: ' + JSON.stringify(response));
                    }

                    next();
                });
            });
        }, next);
    }, function (err) {

        var finish = process.hrtime(self.startTime);
        delete self.startTime;
        var duration = (finish[0] * 1e9 + finish[1]) / 1000000000;

        self.log(['bizzarolout', 'finish'], 'got ' + self.errorCount + ' errors from ' + table.length + ' routes with ' + self.iterations + ' iterations in ' + duration + ' seconds');
        callback(err);
    });
};

exports.register = function (server, options, next) {

    var fuzzer = new internals.factory(server, options);
    server.expose({ fuzz: fuzzer.fuzz.bind(fuzzer) });
    next();
};

exports.register.attributes = {
    pkg: require('../package.json')
};
