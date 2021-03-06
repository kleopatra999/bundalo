/*───────────────────────────────────────────────────────────────────────────*\
 │  Copyright (C) 2016 PayPal                                                  │
 │                                                                             │
 │hh ,'""`.                                                                    │
 │  / _  _ \  Licensed under the Apache License, Version 2.0 (the "License");  │
 │  |(@)(@)|  you may not use this file except in compliance with the License. │
 │  )  __  (  You may obtain a copy of the License at                          │
 │ /,'))((`.\                                                                  │
 │(( ((  )) ))    http://www.apache.org/licenses/LICENSE-2.0                   │
 │ `\ `)(' /'                                                                  │
 │                                                                             │
 │   Unless required by applicable law or agreed to in writing, software       │
 │   distributed under the License is distributed on an "AS IS" BASIS,         │
 │   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  │
 │   See the License for the specific language governing permissions and       │
 │   limitations under the License.                                            │
 \*───────────────────────────────────────────────────────────────────────────*/

/*eslint no-underscore-dangle:0*/
'use strict';
var async = require('async');
var bcp47s = require('bcp47-stringify');
var fastpath = require('fastpath');
var fileResolver = require('file-resolver');
var fs = require('fs');
var iferr = require('iferr');
var monkeymap = require('monkeymap');
var path = require('path');
var spud = require('spud');

function Bundler(config) {
	this.resolver = fileResolver.create({
		root: config.contentPath,
		fallback: config.fallback,
		formatPath: config.formatPath || bcp47s
	});
	this.cache = (config.cache !== undefined && config.cache === false) ? null : {};
}

Bundler.prototype.get = function (config, callback) {
	var cache = this.cache;
	var resolver = this.resolver;
	var bundle = Array.isArray(config.bundle) ? makeObj(config.bundle) : config.bundle;
	monkeymap(bundle, function (file, next) {
		if (path.extname(file) !== '.properties') {
			file = file + '.properties';
		}
		async.compose(decorate, readCached(cache), resolve(resolver, config.locale || config.locality))(file, next);
	}, callback);
};

function resolve(resolver, locale) {
	return function (filename, callback) {
		resolver.resolve(filename, locale, callback);
	};
}

function readCached(cache) {

	return function noneBundler(bundleFile, cb) {
		if (cache && cache[bundleFile]) {
			async.ensureAsync(cb(null, cache[bundleFile]));
			return;
		}
		//not yet in cache
		fs.readFile(bundleFile, iferr(cb, function handleBundleBuffer(bundleBuffer) {
			try {
				var parsed = spud.parse(bundleBuffer.toString());
				if (cache) {
					cache[bundleFile] = parsed;
				}
				safe(cb)(null, parsed);
			} catch (e) {
				safe(cb)(e);
			}
		}));
	};
}

function decorate(obj, cb) {
	cb(null, new Bundle(obj));
}

function Bundle(obj) {
	this.content = obj;
	this.cache = {};
}

Bundle.prototype = {
	get: function (pattern) {
		return this.getAll(pattern)[0];
	},
	getAll: function (pattern) {
		if (pattern) {
			var matcher = fastpath(pattern);
			return matcher.evaluate(this.content);
		} else {
			return this.content;
		}
	}
};

function makeObj(arr) {
	return arr.reduce(function (a, e) {
		a[e] = e;
		return a;
	}, {});
}

function safe(cb) {
	return function() {
		try {
			cb.apply(this, arguments);
		} catch (e) {
			setImmediate(function () {
				throw e;
			});
		}
	};
}

Bundler.prototype.__cache = function () {
	return this.cache || {};
};

module.exports = Bundler;
