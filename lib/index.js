var colors = require('colors');
var Surku = require('./Surku.js') // git clone git@github.com:attekett/Surku.git
//TODO Need detectors for use of headers as parameters within route handlers


var timingAttack = (function() {
    var keywords = '(' + [
        'key',
        'password',
        'secret',
        'api',
        'token',
        'auth',
        'pass',
        'hash'
    ].join(')|(') + ')';
    var test = [];

    test.push("(.*\\(((.*(");
    test.push(keywords);
    test.push(").*(==|===).*)|(.*(==|===).*(");
    test.push(keywords);
    test.push(").*))\\).*)");
    test = test.join('');
    return new RegExp(test, 'gim');
})();

var log = function() {
    var args = Array.prototype.slice.call(arguments);
    var sep = '\n\t\t\t--->\t';
    console.log('\t ' + args.join(sep));
}


/*********************************************************************************************
routingTable: Internal.
Code that is primarily from lout, used to parse the routing table.
***********************************************************************************************/

function routingTable(server) {
    return routingTable.getRoutesData(server.routingTable());

};

routingTable.getRoutesData = function(routes) {

    var routesData = [];
    routes.forEach(function(route) {

        routesData.push({
            path: route.path,
            method: route.method.toUpperCase(),
            description: route.settings.description,
            notes: route.settings.notes,
            tags: route.settings.tags,
            handler: route.settings.handler,
            auth: route.settings.auth || 'NONE', // Need to add a log event if the second case happens. We want to know when auth isn't being used in most cases where this would even be a desired tool.
            queryParams: routingTable.getParamsData(route.settings.validate && route.settings.validate.query),
            payloadParams: routingTable.getParamsData(route.settings.validate && route.settings.validate.payload),
            responseParams: routingTable.getParamsData(route.settings.validate && route.settings.validate.response && route.settings.validate.response.schema)
        });
    });

    return {
        routes: routesData
    };
};


routingTable.getParamsData = function(params) {

    if (params === null ||
        params === undefined ||
        (typeof params !== 'object')) {

        return [];
    }

    var paramsData = [];
    var keys = Object.keys(params);

    for (var i = 0, il = keys.length; i < il; ++i) {
        var key = keys[i];
        var param = params[key];

        paramsData.push({
            name: key,
            description: typeof param.description === 'function' ? '' : param.description,
            notes: typeof param.notes === 'function' ? '' : param.notes,
            tags: typeof param.tags === 'function' ? '' : param.tags,
            type: param.type,
            required: param.__modifiers && param.__modifiers._values ? param.__modifiers._values.some(routingTable.isRequiredParam) : null,
            allowedValues: param.__valids ? routingTable.getExistsValues(param.__valids._exists) : null,
            disallowedValues: param.__invalids ? routingTable.getExistsValues(param.__invalids._exists) : null
        });
    }

    return paramsData;
};


routingTable.getExistsValues = function(exists) {

    var values = [];

    var keys = Object.keys(exists);
    keys.forEach(function(key) {
        key = key.substring(1, key.length - 1);
        if (key !== 'ndefine' && key !== 'ul' && key.length !== 0) {
            values.push(key);
        }
    });

    return values;
};


routingTable.isRequiredParam = function(element) {

    return element === 'required';
};



/*********************************************************************************************


fuzzFactory: External. Constructor.
Provides an API to keep track of test case progress and iterate/generate new test cases.
Takes a single argument opts that is an object setting various configuration options.
Test cases are designed to run in synchronous series.
Running asynchronously will require you to create a new fuzzFactory for each test case. This will quickly exhaust system resources, and is not recommended.

opts: {
    users: array. Provides available user roles to test under.
    server: an instance of the hapi server.
    maxIterations: a number that sets the number of test cases to run on each configuration.
    cb: the callback function that will be ran once each test is completed.
}
returns an instance of fuzzFactory with the following methods:

inject:
Clears previous route information, and sets up a new route for testing.
Begins fuzzing the application on all routes.



***********************************************************************************************/

var fuzzFactory = function(opts) {
    var _this = this;
    this.firstRun = true;
    this.done = function() {};
    if(opts.headers){
        this.headers = opts.headers;
    }
    this.index = {
        user: 0,
        testCount: 0,
        route: 0,
    };
    this.users = opts.users || [
        {
            name: 'Default',
            credentials: {
                    username: 'default',
                    password: 'letmein'
            },
            csrfToken: 'abcdef123'
        },{
        name: 'Admin',
            credentials: {
                    username: 'admin',
                    password: 'letmein'
            },
            csrfToken: 'abcdef123'
        },{
        name: 'CSRF_Check',
            credentials: {
                    username: null,
                    password: null,
            }
        },
    ];
    this.userMap = [];
    this.users.forEach(function(user){
    _this.userMap.push(user.name);
    })
    this.server = opts.server;
    this.maxIterations = opts.maxIterations;
    this.onComplete(opts.cb);
    this.routingTable = routingTable(opts.server).routes;
    this.route = {};
    this.path = this.route.path;
    //Instantiate Surku instances
    this.surku = {
        string: (function() {
            return new Surku()
        })(),
        number: (function() {
            return new Surku()
        })(),
        date: (function() {
            return new Surku()
        })(),
    }

};
fuzzFactory.prototype.testCase = function(param) {
    var _this = this;
    var retVal;
    if (this.csrfTokenNames && (this.csrfTokenNames.indexOf(param.name) !== -1)) {
        if (this.user() === 'CSRF_Check' && (_this.index.testCount % (_this.maxIterations / 10) === 0)) {
            retVal = encodeURIComponent(surku.string.generateTestCase(this.users[0].csrfToken));
            log("Progress: "+ this.maxIterations + '/' + this.index.testCount)
        } else {
            retVal =  this.users[this.index.user].csrfToken;
        }
    } else { try{
        retVal =  encodeURIComponent(_this.seed(param));
    } catch(e){
        retVal =  encodeURIComponent(_this.seed(param));
    }
    }
    return retVal;
};
fuzzFactory.prototype.inject = function(callback) {
    var i = 0;
    if ( i === 0 ){
        fuzzFactory.initializeRoute(fuzzFactory.routingTable[i]);
        _this.server.inject(fuzzFactory.iterate(),callback);
        if(doneTesting === false) return test();
    } else if (i <= fuzzFactory.routingTable.length){
        fuzzFactory.iterate()
        if(doneTesting === false) return test();
        i++;
        doneTesting = false;
        fuzzFactory.initializeRoute(fuzzFactory.routingTable[i]);
        test();
}
};
fuzzFactory.prototype.nextRoute = function() {
    var _this = this;
    _this.index.route++;
    var route = _this.routingTable[_this.index.route-1];
    if(route === undefined){
        return false;
    }
    _this.firstRun = true;
    _this.index = {
        user: 0,
        testCount: 0,
    };
    _this.route = route;
    _this.path = this.route.path;
    if (route.queryParams) {
        route.queryParams.forEach(function(param) {
            if(param.name !=='path'){
            tmp = param;
            tmp.name = param.name;
            tmp.type = param.type;
            tmp.location = 'query';
            tmp.required = param.required || false;
            _this.addParam(tmp);
        }
        })
    };
    if (route.payloadParams) {
        route.queryParams.forEach(function(param) {
            tmp = param;
            tmp.name = param.name;
            tmp.type = param.type;
            tmp.required = param.required || false;
            tmp.location = 'payload';
            _this.addParam(tmp);
        })
    };
    log('Fuzzing Route: ' + route.path, 'AUTH: ' + route.auth, 'Params:' + JSON.stringify(route.queryParams), JSON.stringify(route.payloadParams));
    return true;
};
fuzzFactory.prototype.credentials = function() {
    var _this = this;
     if (_this.user() === 'CSRF_Check' && _this.index.testCount == 0) {
    return this.users[0].credentials;
     }
    return this.users[this.index.user].credentials;
}

fuzzFactory.prototype.user = function() {
    return this.userMap[this.index.user];
};

fuzzFactory.prototype.testCount = function() {
    return this.index.testCount;
};
fuzzFactory.prototype.method = function() {
    return this.route.method;
};
fuzzFactory.prototype.seed = function(param) {
    //Needs more complete types, preprocessor to handle figuring out the type from a routingTable param object, and determining allowable len rather than using static values.
    var _this = this;
    var len;
    var charset = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '/', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '{', '}', ':', '"', ';', '\'', '<', '>', ',', '.', '?', '/', '|', '\\', '~', '`', '�', '�'];
    var retVal;
    var type = param.type.toLowerCase();
    if (param.location === 'query') {
        len = 30
    } else {
        len = 200;
}

        switch (type) {
            case 'string':
                retVal = new Array(len);
                retVal.forEach(function(character, index) {
                    retVal[index] = charset[Math.floor(Math.random() * charset.length - 1)]
                })
                retVal = _this.surku[type].generateTestCase(new Buffer(retVal));
                break;
            case 'number':
                retVal = new Array(len);
                retVal.forEach(function(character, index) {
                    retVal[index] = Math.floor(Math.random() * 9)
                })
                retVal = _this.surku[type].generateTestCase(new Buffer(retVal));
                break;
            default:
                retVal = new Array(len);
                retVal = retVal.join('A');
        }
        return retVal;
};
    fuzzFactory.prototype.addParam = function(newParam) {
        var _this = this;
        if (this.params === undefined) {
            this.params = {
                called: false,
                value: [],
            }
        } else if (this.params.value.indexOf(newParam) !== -1) {
            this.params.called = true;
            return;
        }
        this.params.called = false;
        this.params.value.push(newParam);
    };

    fuzzFactory.prototype.inject = function(callback) {
        var results = {
            params: '/',
        };
        var _this = this;
        var step = function() {
            if (_this.firstRun === true) {
                _this.nextRoute();
                _this.firstRun = false;
                return _this.inject(callback);
            }
            if (_this.index.user >= parseInt(_this.users.length) - 1) {
                _this.index.user = 0;
                if (_this.index.testCount >= _this.maxIterations - 1) {
                    if(!_this.nextRoute()){
                        return _this.done();
                    }
                } else {
                    _this.index.testCount++;
                }
            } else {
                _this.index.user++;
            }
        }

        if (_this.params !== undefined) {
            if (_this.params.called === false) {
                results.params = _this.params.value;
                _this.params.called = true;
            } else {
                step();
            }
        } else {
            step();
        }
        if(_this.headers){
            results.headers = _this.headers;
        }
        results.url = _this.server.info.uri + _this.path;
        results.payload = {};
        results.credentials = _this.credentials();
        results.userName = _this.user();
        results.method = _this.method();
        _this.params.value.forEach(function(param) {
            if (param.location === 'query') {
                if (results.url.indexOf('{' + param.name + '}') !== -1) {
                    results.url = results.url.replace('{' + param.name + '}', _this.testCase(param))
                } else if (results.url.indexOf('?') !== -1) {
                    results.url += '&' + param.name + '=' + _this.testCase(param);
                } else {
                    results.url += '?' + param.name + '=' + _this.testCase(param);
                }
            } else {
                results.payload[param.name] = _this.testCase(param);
            }
        })
        results.payload = JSON.stringify(results.payload);

        _this.server.inject(results, function(){
            callback(arguments);
            return _this.inject(callback);
        });
    }
    fuzzFactory.prototype.onComplete = function(fn) {
        var _this = this;
        this.done = fn;
    }

    module.exports = fuzzFactory;


    /// END GLOBALS  ////