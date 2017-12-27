/**
 *
 * google sharedlocations adapter
 *
 *
 *  file io-package.json comments:
 *
 * {
 *  "common": {
 *      "name":                     "google-sharedlocations",
 *       "version":                  "0.0.1",
 *    "news": {
 *		"0.0.1": {
 *		  "en": "initial adapter",
 *		  "de": "Initiale Version",
 *		  "ru": "Первоначальный адаптер"
 *		}
 *	},
 *       "title":                    "Google shared locations adapter",
 *       "desc":                     {
 *			 "en": "ioBroker Google Shared Locations Adapter",
 *			 "de": "ioBroker Google Shared Locations Adapter"
 *	},
 *      "platform":                 "Javascript/Node.js",
 *      "mode":                     "daemon",
 *      "icon":                     "google-sharedlocations.png",
 *      "enabled":                  true,
 *  "extIcon":                  "https://raw.githubusercontent.com/t4qjXH8N/ioBroker.google-sharedlocations/master/admin/google-sharedlocations.png",
 *	"keywords":                 ["google", "geofence", "sharedlocations"],
 *       "readme":                   "https://github.com/t4qjXH8N/ioBroker.google-sharedlocations/master/README.md",
 *		"loglevel":                 "debug",
 *        "type":                     "geoposition",
 *        "restartAdapters":          ["vis"]
 *    },
 *    "native": {
 *      "google_username": "me@me.com",
 *      "google_password": "secret",
 *      "google_polling_interval": "600"
 *    },
 *    "objects": [
 *   ]
 * }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// for communication
const request = require('request');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.google-sharedlocations.0
var adapter = utils.adapter('google-sharedlocations');

// google cookies
var google_cookies = {
  "google.com": {
    "GAPS": "",
    "GALX": "",
    "SID": "",
    "LSID": "",
    "SIDCC": "",
    "HSID": "",
    "SSID": "",
    "APISID": "",
    "SAPISID": "",
    "ACCOUNT_CHOOSER": "",
    "NID": "",
    "CONSENT": "",
    "1P_JAR": ""
  }
};

// google form
var google_form = {
  "gxf": "",
  "ProfileInformation": "",
  "SessionState": ""
};

// redirector URL
var google_fourth_location_url = "";

var google_polling_interval_id = null;

// after auth we are redirected to the local google domain. Default is google.com, otherwise google_locator
// is set to the new google domain
var google_locator = "google.com";

// triggered when the adapter is installed
adapter.on('install', function () {
  // create connection variable https://github.com/ioBroker/ioBroker/wiki/Adapter-Development-Documentation#infoconnection
});

// is called when the adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
  try {
    adapter.log.info('cleaned everything up...');
      callback();
  } catch (e) {
      callback();
  }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
  // Warning, obj can be null if it was deleted
  adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
  // Warning, state can be null if it was deleted
  adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

  // connection related state change
  if(id && state && id === state.from.split('.')[2]+'.'+state.from.split('.')[3] + '.' + 'info.connection') {

  }

  // you can use the ack flag to detect if it is status (true) or command (false)
  if (state && state.val && !state.ack) {
    adapter.log.debug('ack is not set!');
  }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
  adapter.setObjectNotExists('info.connection', {
    type: 'state',
    common: {
      name: 'connected',
      desc: 'Connected to Google account?',
      type: 'boolean',
      def: 'false',
      read: 'true',
      role: 'value.info',
      write: 'false'
    },
    native: {}
  }, function(err) {
    if(!err) {
      // start main function
      main();
    }
  });

});

// main function
function main() {

  // The adapters config (in the instance object everything under the attribute "native") is accessible via
  // adapter.config:
  adapter.log.info('Starting google shared locations adapter');

  // first query
  querySharedLocations(function (err) {
  });

  // enable polling
  google_polling_interval_id = setInterval(function () {
       poll(function() {});
     }, Number(adapter.config.google_polling_interval)*1000);

  // google subscribes to all state changes
  adapter.subscribeStates('*');
}

// login, get locations and logout
function querySharedLocations(callback) {
  // connect to Google
  connect(function(err) {
    if (err) {
      adapter.log.error('First connection failed.');
    } else {
      getSharedLocations(function (err, userobjarr) {
        if (err) {
          adapter.setState('info.connection', false, true);
        } else {

          // check fences
          checkFences(userobjarr, function (err) {
            if (err) {
              adapter.log.error('Error during fence check.')
            } else {
              updateStates(userobjarr, function (err) {
                if (err) {

                } else {
                  logout(function (err) {
                    if(err) {
                      adapter.setState('info.connection', false, true);
                    } else {
                      // logout done, but everything worked fine, so set connection to true
                      adapter.setState('info.connection', true, true);
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });


}

// update states
function updateStates(userobjarr, callback) {

  if(userobjarr) {
    for(var i=0;i<userobjarr.length;i++) {
      // go through users
      for(var cprop in userobjarr[i]) {
        if(userobjarr[i].hasOwnProperty(cprop)) {
          // cur properties
          var cid = 'user.' + userobjarr[i].id + '.' + cprop;

          switch(typeof userobjarr[i][cprop]) {
            case 'number':
              setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'number',
                  role: 'value.number',
                  read: 'true',
                  write: 'false'
                }
                }, userobjarr[i][cprop], true);
              break;
            case 'string':
              setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'string',
                  role: 'value.string',
                  read: 'true',
                  write: 'false'
                }
              }, userobjarr[i][cprop], true);
              break;
            case 'boolean':
              setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'boolean',
                  role: 'value.boolean',
                  read: 'true',
                  write: 'false'
                }
              }, userobjarr[i][cprop], true);
              break;
          }
        }
      }
    }
  }

  if(callback) callback(false);
}

// establish connection to google
function connect(callback) {

  connectFirstStage(function (err) {
    if (err) {
      adapter.log.error('First stage auth error');
      adapter.setState('info.connection', false, true);
      if (callback) callback(err);
    } else {
      // no error
      connectSecondStage(function (err) {
        if (err) {
          adapter.log.error('Second stage (auth user) error');
          adapter.setState('info.connection', false, true);
          if (callback) callback(err);
        } else {
          connectThirdStage(function (err) {
            if(err) {
              adapter.log.error('Third stage (auth password) error');
              adapter.setState('info.connection', false, true);
              if (callback) callback(err);
            } else {
              connectFourthStage(function(err) {
                if(err) {
                  adapter.log.error('Fourth stage (locator) error');
                  adapter.setState('info.connection', false, true);
                  if (callback) callback(err);
                } else {
                  adapter.setState('info.connection', true, true);
                  if (callback) callback(false);
                }
              });
            }
          });
        }
      });
    }
  });
}

// connect to Google, call login page
function connectFirstStage(callback) {
  adapter.log.info("First stage, connecting to Google ...");

  // set connection state to false at the beginning
  adapter.setState('info.connection', false, true);

  // first get GAPS cookie
  var options_connect1 = {
    url: "https://accounts.google.com/ServiceLogin",
    headers: {},
    method: "GET",
    qs: {
      "rip": "1",
      "nojavascript": "1"
      }
    };

  request(options_connect1, function(err, response, body){
    if(err || !response) {
      // no connection
      adapter.log.error(err);
      adapter.log.info('Connection failure.');
      if(callback) callback(true);
    } else {
      // connection successful
      adapter.log.debug('Response: ' + response.statusMessage);

      // connection established but auth failure
      if(response.statusCode !== 200) {
        adapter.log.debug('Removed cookies.');
        adapter.log.error('Connection works, but authorization failure (wrong password?)!');
        if(callback) callback(true);
      } else {
        // save cookies etc.
        if(response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          // save gfx value from received form field
          var gxfdom = response.body.match(/<input\s+type="hidden"\s+name="gxf"\s+value="\S*/g);
          google_form['gxf'] = gxfdom[0].split('"')[5];

          saveConnectionCookies(response.headers['set-cookie'], 'google.com');

          adapter.log.debug('Saved connection cookies.');
          adapter.log.info('Connection successful.');
          if(callback) callback(false);
        } else {
          adapter.log.debug('No cookie found.');
          adapter.log.error('No cookie found.');
          if(callback) callback(true);
        }
      }
    }
  });
}

// connected to Google, send username (E-Mail address)
function connectSecondStage(callback) {
  adapter.log.info("Second stage, sending E-Mail address ...");

  var username = adapter.config.google_username;

  var options_connect2 = {
    url: "https://accounts.google.com/signin/v1/lookup",
    headers: {
      "Cookie": "GAPS=" + google_cookies['google.com']['GAPS']
    },
    method: "POST",
    form: {
      "Page": "PasswordSeparationSignIn",
      "gxf": google_form['gxf'],
      "rip": "1",
      "ProfileInformation": "",
      "SessionState": "",
      "bgresponse": "js_disabled",
      "pstMsg": "0",
      "checkConnection": "",
      "checkedDomains": "youtube",
      "Email": username,
      "identifiertoken": "",
      "identifiertoken_audio": "",
      "identifier-captcha-input": "",
      "signIn": "Weiter",
      "Passwd":"",
      "PersistentCookie": "yes"
    }

  };

  request(options_connect2, function(err, response, body){
    if(err || !response) {
      // no connection
      adapter.log.error(err);
      adapter.log.info('Connection failure.');
      if(callback) callback(true);
    } else {
      // connection successful
      adapter.log.debug('Response: ' + response.statusMessage);

      // connection established but auth failure

      if(response.statusCode !== 200) {
        adapter.log.debug('Removed cookies.');
        adapter.log.error('Connection works, but authorization failure (wrong password?)!');
        if(callback) callback(true);
      } else {
        // save cookies etc.
        if(response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          saveConnectionCookies(response.headers['set-cookie'], 'google.com');

          // extract some information from the form
          var profileinformationdom = response.body.match(/<input\s+id="profile-information"\s+name="ProfileInformation"\s+type="hidden"\s+value="\S*/g);
          google_form['ProfileInformation'] = profileinformationdom[0].split('"')[7];
          var sessionstatedom = response.body.match(/<input\s+id="session-state"\s+name="SessionState"\s+type="hidden"\s+value="\S*/g);
          google_form['SessionState'] = sessionstatedom[0].split('"')[7];

          adapter.log.debug('Saved connection cookies.');
          adapter.log.info('Connection successful.');
          if(callback) callback(false);
        } else {
          adapter.log.debug('No cookie found.');
          adapter.log.error('No cookie found.');
          if(callback) callback(true);
        }
      }
    }
  });
}

// connected to Google, send password
function connectThirdStage(callback) {
  adapter.log.info("Third stage, sending password ...");

  var username = adapter.config.google_username;
  var password = adapter.config.google_password;

  var options_connect3 = {
    url: "https://accounts.google.com/signin/challenge/sl/password",
    headers: {
      "Cookie": "GAPS=" + google_cookies['google.com']['GAPS'] + "; " + "GALX=" + google_cookies['google.com']['GALX'],
      "Origin": "https://accounts.google.com",
      "Referer": "https://accounts.google.com/signin/v1/lookup",
      "Upgrade-Insecure-Requests": "1"
    },
    method: "POST",
    form: {
      "Page": "PasswordSeparationSignIn",
      "GALX": google_cookies['google.com']['GALX'],
      "gxf": google_form['gxf'],
      "checkedDomains": "youtube",
      "pstMsg": "0",
      "rip": "1",
      "ProfileInformation": google_form['ProfileInformation'],
      "SessionState": google_form['SessionState'],
      "_utf8": "☃",
      "bgresponse": "js_disabled",
      "checkConnection": "",
      "Email": username,
      "signIn": "Weiter",
      "Passwd": password,
      "PersistentCookie": "yes",
      "rmShown": "1"
    }
  };

  request(options_connect3, function(err, response, body){
    if(err || !response) {
      // no connection

      adapter.log.error(err);
      adapter.log.info('Connection failure.');
      if(callback) callback(true);
    } else {
      // connection successful
      adapter.log.debug('Response: ' + response.statusMessage);

      // connection established but auth failure
      if(response.statusCode !== 302) {
        adapter.setState('info.connection', false, true);

        adapter.log.debug('Redirector http code 302 expected, but ' + response.statusCode + ' received.');
        adapter.log.error('Redirector expected, but not received!!');
        if(callback) callback(true);
      } else {
        // save cookies etc.
        if(response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          saveConnectionCookies(response.headers['set-cookie'], 'google.com');

          // get location url
          google_fourth_location_url = response.headers.location;

          adapter.log.info('Authentication successful, received location URL.');
          adapter.log.debug('Received new location URL ' + google_fourth_location_url + '.');
          if(callback) callback(false);
        } else {
          adapter.log.debug('No cookie found.');
          adapter.log.error('No cookie found.');
          if(callback) callback(true);
        }
      }
    }
  });
}

// connected to Google, follow redirector, retrieve cookies from localized pages
function connectFourthStage(callback) {
  adapter.log.info('Fourth stage, redirecting to  ' + google_fourth_location_url);

  getCookieHeader('google.com', function(err, cookieheader) {

    var options_connect4 = {
      url: google_fourth_location_url,
      headers: {
        "Cookie": cookieheader
      },
      method: "POST"
    };

    request(options_connect4, function (err, response, body) {
      if (err || !response) {
        // no connection

        adapter.log.error(err);
        adapter.log.info('Connection failure.');
        if (callback) callback(true);
      } else {
        // connection successful
        adapter.log.debug('Response: ' + response.statusMessage);

        // connection established but an error occured
        if (response.statusCode !== 302) {
          adapter.setState('info.connection', false, true);

          adapter.log.debug('Removed cookies.');
          adapter.log.error('Connection works, but authorization failure (wrong password?)!');
          if (callback) callback(true);
        } else {
          // save cookies etc.
          if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
            saveConnectionCookies(response.headers['set-cookie'], 'google.com');

            adapter.log.debug('Saved connection cookies.');
            adapter.log.info('Connection successful.');
            if (callback) callback(false);
          } else {
            adapter.log.debug('No cookie found.');
            adapter.log.error('No cookie found.');
            if (callback) callback(true);
          }
        }
      }
    });
  });
}

// poll locations, devices, etc.
function poll(callback) {

  adapter.log.info('Polling locations.');

  querySharedLocations(function (err) {

  });

  callback(false);
}

// check fences
function checkFences(userobjarr, callback) {

  adapter.log.info('Checking fences.');
  var fences = adapter.config.fences;

  // check fences
  for(var i=0;i<fences.length;i++) {
    var cfence = fences[i];

    // go through all users
    for(var j=0;j<userobjarr.length;j++) {
      var cuser = userobjarr[j];

      // check user
      if(cuser.id === cfence.userid) {
        // calc distance
        var curdist = haversine(cuser.lat, cuser.long, Number(cfence.center_lat), Number(cfence.center_long));
        var fenceid = 'fence.' + i;

        var cstate = curdist <= cfence.radius;

        setStateEx(fenceid, {
          common: {
            name: cfence.description,
            desc: 'Fence for user ' + cuser.name,
            type: 'boolean',
            role: 'value.boolean',
            read: 'true',
            write: 'false'
          }
        }, cstate, true);

        break;
      }
    }
  }

  callback(false);
}

// synchronize config
function syncConfig() {

}

// setStateEx
function setStateEx(id, common, val, ack, callback) {
  var a = {
    type: 'state',
    native: {}
  };

  var common_full = Object.assign({}, a, common);

  var cfunc = function (err) {
    adapter.setState(id, val, ack, function(err) {
      if(err) adapter.log.error('Could not create extended state id:' + id + ', val:' + val);
    });
  };

  adapter.setObject(id, common_full, cfunc);

  if(callback) callback(false);
}

// query google shared locations
function getSharedLocations(callback) {

  getCookieHeader('google.com', function(err, cookieheader) {

    var options_map = {
      url: "https://www.google.com/maps/preview/locationsharing/read",
      headers: {
        "Cookie": cookieheader
      },
      method: "GET",
      qs: {
        "authuser": 0,
        "pb": ""
      }
    };

    request(options_map, function(err, response, body){
      if(err || !response) {
        // no connection

        adapter.log.error(err);
        adapter.log.info('Connection to google maps failure.');
        if(callback) callback(true);
      } else {
        // connection successful
        adapter.log.debug('Response: ' + response.statusMessage);

        // connection established but auth failure
        if(response.statusCode !== 200) {
          adapter.setState('info.connection', false, true);

          adapter.log.debug('Removed cookies.');
          adapter.log.error('Connection works, but authorization failure (wrong password?)!');
          if(callback) callback(true);
        } else {
          // parse and save user locations
          var locationdata = JSON.parse(body.split('\n').slice(1, -1).join(''));

          parseLocationData(locationdata, function(err, userobjarr) {
            if(err) {
              if(callback) callback(err);
            } else {
              if(callback) callback(false, userobjarr);
            }
          });
        }
      }
    });
  });
}

// logout from google
function logout(callback) {

  getCookieHeader('google.com', function(err, cookieheader) {

    adapter.log.debug('Logout attempt.');
    adapter.log.debug('Current cookie : ' + cookieheader);
    var options_map = {
      url: "https://accounts.google.com/logout",
      headers: {
        "Cookie": cookieheader
      },
      method: "GET"
    };

    request(options_map, function(err, response, body){
      if(err || !response) {
        // no connection

        adapter.log.error(err);
        adapter.log.info('Disconnect from google maps failed.');
        if(callback) callback(true);
      } else {
        // connection successful
        adapter.log.debug('Response: ' + response.statusMessage);

        // connection established but auth failure
        if(response.statusCode !== 200) {
          adapter.setState('info.connection', false, true);

          adapter.log.debug('HTTP error (not 200).');
          adapter.log.error('HTTP error (not 200).');
          if(callback) callback(true);
        } else {
          // parse and save user locations
          adapter.log.info('Logout from google.');
        }
      }
    });
  });
}

// compose the header cookie data
function getCookieHeader(domain, callback) {
  var cookiestr = '';
  for(var curcookie in google_cookies[domain]) {
    cookiestr = cookiestr + curcookie + '=' + google_cookies[domain][curcookie] + ';'
  }
  callback(false, cookiestr.slice(0, -1));
}

// save cookies from google
function saveConnectionCookies(setcookies, domain) {

  for(var i=0; i<setcookies.length;i++) {
    var key = setcookies[i].split(';')[0].split('=')[0];
    var val = setcookies[i].split(';')[0].split('=')[1];

    if(google_cookies[domain].hasOwnProperty(key)) {
      google_cookies[domain][key] = val;
    }
  }
}

// parse the retrieved location data
function parseLocationData(locationdata, callback) {

  // shared location data is contained in the first element
  var perlocarr = locationdata[0];

  if(perlocarr.length > 0) {
    var userdataobjarr = [];

    for(var i=0; i<perlocarr.length;i++) {
      extractUserLocationData(perlocarr[i], function(err, obj) {
        if(err) {
          if(callback) callback(err);
        } else {
          userdataobjarr[i] = obj;
        }
      });
    }

    if(callback) callback(false, userdataobjarr);
  } else {
    if(callback) callback(false);
  }
}

// get user date and create states form
function extractUserLocationData(userdata, callback) {

  var userdataobj = {
    "id": userdata[0][0],
    "photoURL": userdata[0][1],
    "name": userdata[0][3],
    "lat": userdata[1][1][2],
    "long": userdata[1][1][1]
  };

  if(callback) callback(false, userdataobj);
}

// latitude and longitude in degree decimal notation
function haversine(deg_lat1, deg_lon1, deg_lat2, deg_lon2) {
  var lat1 = deg_lat1/180*Math.PI;
  var lon1 = deg_lon1/180*Math.PI;
  var lat2 = deg_lat2/180*Math.PI;
  var lon2 = deg_lon2/180*Math.PI;

  var R = 6372.8;
  var dLat = lat2 - lat1;
  var dLon = lon2 - lon1;

  var a = Math.sin(dLat / 2) * Math.sin(dLat /2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon /2);
  return 2.0 * R * Math.asin(Math.sqrt(a)) * 1000;
}