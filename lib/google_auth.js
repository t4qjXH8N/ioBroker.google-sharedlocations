"use strict";

const proxy   = require('express-http-proxy');  // for proxy method
const app     = require('express')();
const _       = require('underscore');
const async   = require('async');
const cheerio = require('cheerio');
const request = require('request');  // for communication

class Auth {
  constructor(domain) {
    this.domain = domain;
    this.logger = null;
    this.connection = null;

    this.credentials = {
      google_username: null,
      google_password: null
    };
    this.google_cookies = {};  // holds cookies from google
    this.google_cookies[domain] = {};
    this.google_form = {};  // holds google form data

  }

  connectSimpleChallenge() {
    if(!this.connection) {
      this.connection = new SimpleChallenge(this.logger, this.domain, this.credentials);
    }
  }

  connectThroughProxy() {
    if(!this.connection) {
      this.connection = new ProxyMethod(this.logger, this.domain, this.credentials);
    }
  }

  retrieveCookies(callback) {
    let self = this;
    if(self.connection) {
      self.connection.retrieveCookies((err, cookies) => {
        self.google_cookies = cookies;
        callback(err, cookies);
      });
    } else {
      callback('No associated connection!');
    }
  }

  // clear session
  clearSession(callback) {
    if(!this.connection) {
      callback('No session active.');
      return
    }

    let self = this;
    self.logger.debug('[google auth] Clearing session ...');

    let options_map = {
      url: "https://accounts.google.com/logout",
      headers: {
        "Cookie": this.connection.composeCookiesForHeader()
      },
      method: "GET"
    };

    request(options_map, function(err, response, body){
      if(err || !response) {
        // no connection
        self.logger.debug('[google auth] Clearing session failed. Error: ' + err);
        if(callback) callback(null, err);
      } else {
        // connection successful
        if(response.statusCode !== 200) {
          self.logger.debug('[google auth] Clearing session yielded HTTP 200.');
          if(callback) callback(null, "Logout failed!");
        } else {
          // all fine
          self.logger.debug('[google auth] Session cleared.');
          if(callback) callback(null, false);
        }
      }
    });
  }
}

// I: get connection cookies without challenge or with recovery email-address challenge
class SimpleChallenge {
  constructor(logger, domain, credentials) {
    this.logger = logger;
    this.domain = domain;
    this.credentials = credentials;
    this.google_cookies = {};  // holds cookies from google
    this.google_cookies[domain] = {};
  }

  retrieveCookies(callback) {
    async.waterfall([
      (cb) => {this.firstStage(cb);},
      (form, cb) => {this.secondStage(form, cb);},
      (form, cb) => {this.thirdStage(form, cb);},
    ], (err, cookies) => {
      this.google_cookies = cookies;
      if(callback) callback(err, cookies);
    });
  }

  // compose the header from cookie data, this header can be directly used in a request
  composeCookiesForHeader() {
    let cookiestr = '';
    for(let curcookie in this.google_cookies[this.domain]) {
      cookiestr = cookiestr + curcookie + '=' + this.google_cookies[this.domain][curcookie] + ';'
    }

    return cookiestr.slice(0, -1);
  }

  // extract cookies from http header and store them
  parseCookiesInHeader(header_cookies) {
    let google_cookies = {};  // holds cookies from google
    google_cookies[this.domain] = {};

    for(let i=0; i<header_cookies.length;i++) {
      let key = header_cookies[i].split(';')[0].split('=')[0];
      let val = header_cookies[i].split(';')[0].split('=')[1];

      google_cookies[this.domain][key] = val;
    }

    return google_cookies;
  }

  connectFirstStage(callback) {
    self.logger.debug('[google auth] Connection First State');
    // first get GAPS cookie
    let options_connect1 = {
      url: "https://accounts.google.com/ServiceLogin",
      headers: {
      },
      method: "GET",
      qs: {
        "rip": "1",
        "nojavascript": "1",
        "flowName": "GlifWebSignIn",
        "flowEntry": "ServiceLogin"
      }
    };

    request(options_connect1, (err, response, body) => {
      if(err || !response) {
        // no connection
        self.logger.debug('[google auth] Connection error: ' + err);
        if(callback) callback(err);
      } else {
        if(response.statusCode !== 200) {
          // connection established but something went wrong
          self.logger.debug('[google auth] First stage error, could not retrieve cookie or glx!');
          if(callback) callback('First stage error, could not retrieve cookie or glx!');
        } else {
          // connection successful, save cookies etc.
          if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
            self.google_cookies = self.parseCookiesInHeader(response.headers['set-cookie']);
          }

          // get all form fields
          const $ = cheerio.load(response.body);
          const google_form = SimpleChallenge.serialized_array_to_dict($("form").serializeArray())[0];

          self.logger.debug('[google auth] Connection first stage successful');
          if(callback) callback(err, google_form);
        }
      }
    });
  }

  // we have the GAPS cookie and the glx identifier,
  // start username nad password challenge now
  secondStage(google_form, callback) {
    let self = this;
    self.logger.debug('[google auth] Connection second State');
    google_form['Email'] = self.credentials.google_username;

    let options_connect2 = {
      uri: "https://accounts.google.com/signin/v1/lookup",
      headers: {
        "Cookie": getCookieHeader('google.com')
      },
      method: "POST",
      form: google_form
    };

    request(options_connect2, (err, response, body) => {
      if(err || !response) {
        // no connection
        self.logger.debug('[google auth] Connection error: ' + err);
        if(callback) callback(err);
      } else {
        // connection successful
        // save cookies etc.
        if(response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          self.google_cookies = self.parseCookiesInHeader(response.headers['set-cookie']);
        }

        // first simply get all form fields
        const $ = cheerio.load(response.body);
        google_form = SimpleChallenge.serialized_array_to_dict($("form").serializeArray());

        self.logger.debug('[google auth] Connection second stage successful');
        if (callback) callback(err, google_form);
      }
    });
  }

  // we have the GAPS cookie and the glx identifier,
  // start username nad password challenge now
  thirdStage(google_form, callback) {
    let self = this;
    self.logger.debug('[google auth] Connection third stage');
    google_form['Passwd'] = self.credentials.google_password;

    let options_connect3 = {
      url: "https://accounts.google.com/signin/challenge/sl/password",
      headers: {
        "Cookie": self.composeCookiesForHeader('google.com')
      },
      method: "POST",
      form: google_form
    };

    request(options_connect3, (err, response, body) => {
      if(err || !response) {
        // no connection
        if(callback) callback(err);
      } else {
        // update cookies
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          self.google_cookies = self.parseCookiesInHeader(response.headers['set-cookie']);
        }

        if (response.headers.hasOwnProperty('set-cookie') && response.headers['set-cookie'].length > 1) {
          // password challenge fine

          self.logger.debug('[google auth] Connection third stage successful, password challenge only.');
          if (callback) callback(false);
        } else if (response.headers.locations && response.headers.locations.includes('rejected')) {
          // password challenge or something similar went wrong
          self.logger.debug('[google auth] Simple login is not possible. Use proxy method.');
          if (callback) callback('Simple login is not possible. Use proxy method.');
        }
      }
    })
  }

  static serialized_array_to_dict(arr) {
    let dict = [];
    dict[0] = {};
    let curind = 0;

    for (let i=0;i < arr.length;i++) {
      // check if key already exists

      while ((typeof dict[curind] !== 'undefined') && (arr[i].name in dict[curind])) {
        curind += 1;
      }

      if (curind === dict.length) {
        dict[curind] = {}
      }

      dict[curind][arr[i].name] = arr[i].value;

      curind = 0;
    }

    if (dict.length === 1) {
      return dict[0];
    } else {
      return dict
    }
  }
}

class ProxyMethod {
  constructor(logger, proxy_port, domain, credentials) {
    this.logger = logger;
    this.proxy_port = proxy_port;
    this.domain = domain;
    this.credentials = credentials;
    this.google_cookies = {};  // holds cookies from google
    this.google_cookies[domain] = {};
  }

  // helper: get cookie using a proxy
  static changeOriginAndRefererInReqHeader(headers, old_origin, new_origin) {
    // replace origin in the header
    if(headers && headers.origin) {
      headers.origin = headers.origin.replace(old_origin, new_origin);
    }

    if(headers && headers.referer) {
      headers.referer = headers.referer.replace(old_origin, new_origin);
    }

    return headers;
  }

  // extract cookies from http header and store them
  parseCookiesInHeader(header_cookies) {
    let google_cookies = {};  // holds cookies from google
    google_cookies[this.domain] = {};

    for(let i=0; i<header_cookies.length;i++) {
      let key = header_cookies[i].split(';')[0].split('=')[0];
      let val = header_cookies[i].split(';')[0].split('=')[1];

      google_cookies[this.domain][key] = val;
    }

    return google_cookies;
  }

  // setup a proxy for catching the cookie
  retrieveCookie(callback) {
    let self = this;
    app.use('/', proxy('https://accounts.google.com', {

      userResHeaderDecorator: function (headers, userReq, userRes, proxyReq, proxyRes) {
        // receives an Object of headers, returns an Object of headers.
        delete headers['x-auto-login'];

        if (headers['set-cookie']) {
          if (headers['set-cookie'].length > 1) {
            // got some interesting cookies? if so, save cookies

            self.google_cookies = self.parseCookiesInHeader(headers['set-cookie']);
            callback(false, self.google_cookies);
          }

          headers['set-cookie'] = _.map(headers['set-cookie'], (cookie) => {
            return cookie.replace(/secure;/ig, '');
          });
        }

        return headers;
      },
      proxyReqOptDecorator: function (proxyReqOpts, originalReq) {
        proxyReqOpts.headers = ProxyMethod.changeOriginAndRefererInReqHeader(
          proxyReqOpts.headers, "/http\:\/\/localhost\:" + self.proxy_port + "/", 'https://accounts.google.com');

        return proxyReqOpts;
      },
      userResDecorator: function (proxyRes, proxyResData, userReq, userRes) {
        let data = proxyResData.toString();
        data = data.replace(
          /base href="https\:\/\/accounts.google.com\/"/, 'base href="http://localhost:' + self.proxy_port + '/"');

        return data;
      }
    }));

    app.listen(self.proxy_port);
  };
}

exports.Auth = Auth;