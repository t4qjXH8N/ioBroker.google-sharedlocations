"use strict";

const async        = require('async');
const google_auth  = require(__dirname + '/lib/google_auth');
const module_path = __dirname + '/lib/google_auth';

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils

// for communication
const request = require('request');

const min_polling_interval = 30; // minimum polling interval in seconds
const trigger_poll_state = 'trigger_poll';  // state for triggering a poll

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.google-sharedlocations.0
const adapter = new utils.adapter('google-sharedlocations');

const auth    = new google_auth.Auth('google.com');
//import Auth from module_path;

// VARIABLES
let google_polling_interval_id;
let google_cookie_header;

// triggered when the adapter is installed
adapter.on('install', () => {});

// is called when the adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
  callback(false);
});

// is called if a subscribed object changes
adapter.on('objectChange', (id, obj) => {
  // Warning, obj can be null if it was deleted
  adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', (id, state) => {
  // Warning, state can be null if it was deleted
  adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

  // connection related state change
  if(id && state && id === state.from.split('.')[2]+'.'+state.from.split('.')[3] + '.' + 'info.connection') {
    // TODO: do something here
  }

  // a poll is triggered
  if(id && state && id === 'google-sharedlocations.' + adapter.instance + '.' + trigger_poll_state && state.val === true) {
    triggerSingleQuery();

    adapter.setState(trigger_poll_state, false, false) // reset trigger state
  }

  // you can use the ack flag to detect if it is status (true) or command (false)
  if (state && state.val && !state.ack) {
    adapter.log.debug('ack is not set!');
  }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', () => {
  // The adapters config (in the instance object everything under the attribute "native") is accessible via
  // adapter.config:
  adapter.log.info('Starting google shared locations adapter');

  async.series([
    syncConfig,  // sync config
    preparePolling  // polling
  ]);

  // subscribe states
  adapter.subscribeStates('info.connection');
  adapter.subscribeStates(trigger_poll_state);
  adapter.subscribeStates('fence.*');
});

// messages
adapter.on('message', (obj) => {
  let wait = false;
  let credentials;
  let connected;

  function DBUsersToSendTo(callback) {
    let ids = [];

    // get users
    adapter.getStates('google-sharedlocations.' + adapter.instance + '.user.*', function(err, states) {
      if(!err) {
        for (let cstate in states) {
          if (cstate.split('.')[cstate.split('.').length - 1] === 'id') {
            ids.push(cstate.split('.')[cstate.split('.').length - 2]);
          }
        }

        // get photo urls
        let res = [];
        for (let i = 0; i < ids.length; i++) {
          res.push({
            "id": ids[i],
            "photoURL": states['google-sharedlocations.' + adapter.instance + '.user.' + ids[i] + '.photoURL'].val,
            "name": states['google-sharedlocations.' + adapter.instance + '.user.' + ids[i] + '.name'].val
          });
        }

        callback(res);
      } else {
        callback(false);
      }
    });
  }

  if (obj) {
    switch (obj.command) {
      case 'checkConnection':
        credentials = JSON.parse(obj.message);

        auth.connect('credentials', credentials.google_username, credentials.google_password, adapter, (err, cookie) => {
          if(!err) {
            // after the query, issue a logout
            auth.logout();

            adapter.sendTo(obj.from, obj.command, cookie, obj.callback);
          } else {
            adapter.sendTo(obj.from, obj.command, err, obj.callback);
          }
        });
        wait = true;
        break;
      case 'triggerPoll':
        triggerSingleQuery(function (err) {
          adapter.sendTo(obj.from, obj.command, err, obj.callback);
        });
        wait = true;
        break;
      case 'getUsers':
        connected = false;
        credentials = JSON.parse(obj.message);

        auth.connect(null, credentials.google_username, credentials.google_password, adapter, (err, cookie) => {
          if(!err) {
            connected = true;
            google_cookie_header = cookie;

            querySharedLocations((err) => {
              if (!err) {
                DBUsersToSendTo((res) => {
                  adapter.sendTo(obj.from, obj.command, res, obj.callback);
                });

                // after the query, issue a logout
                auth.logout();
              }
            });
          }
        });
        wait = true;
        break;
      case 'getUsersFromDB':
        // get users
        DBUsersToSendTo((res) => {
          adapter.sendTo(obj.from, obj.command, res, obj.callback);
        });
        wait = true;
        break;
      default:
        adapter.log.warn("Unknown command: " + obj.command);
        break;
      case 'startProxy':
        connected = false;
        //credentials = JSON.parse(obj.message);  // do we have some credentials here?

        auth.getCookieFromProxy(50000, adapter, (err, cookie) => {
          adapter.sendTo(obj.from, obj.command, cookie, obj.callback);
        });
        wait = true;
        break;
    }
  }
  if (!wait && obj.callback) {
    adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
  }

  return true;
});

// synchronize config
function syncConfig(callback) {
  // copy cookie from the config to the object instance if it differs
  adapter.getState('info.cookies', (err, state) => {
    if(!err && (!state || !state.val || state.val !== adapter.config.cookie_string)) {
      // update cookie in the database with the cookie from the config
      adapter.setState('info.cookies', adapter.config.cookie_string, true);
    }
  });

  function stateInConfig(cstate) {
    let fences = adapter.config.fences;
    for(let j=0;j<fences.length;j++) {
      if('google-sharedlocations.' + adapter.instance + '.fence.' + fences[j].fenceid === cstate) {
        return true;
      }
    }
    return false;
  }

  function stateInDB(cstate, callback) {
    adapter.getStates('google-sharedlocations.' + adapter.instance + '.fence.*', function(err, states) {
      callback(states.hasOwnProperty(cstate));
    });
  }

  // check if there are states that have to be removed
  adapter.getStates('google-sharedlocations.' + adapter.instance + '.fence.*', function(err, states) {
    if (err) {
      adapter.log.error('SyncConfig: Could not retrieve states!');
    } else {
      for (let cstate in states) {
        if (!stateInConfig(cstate)) adapter.delObject(cstate);
      }
    }
  });

  let fences = adapter.config.fences;
  // create missing states
  for(let i=0;i<fences.length;i++) {
    stateInDB('google-sharedlocations.' + adapter.instance + '.fence.' + fences[i].fenceid, function(inDB) {
      if(!inDB) {
        // set all states to false at the beginning and create them if they do not exist
        setStateEx('fence.' + fences[i].fenceid, {
          common: {
            name: fences[i].description,
            desc: 'Fence for user ' + fences[i].userid,
            type: 'boolean',
            role: 'indicator',
            def: 'false',
            read: 'true',
            write: 'false'
          }
        }, false, true);
      }
    });
  }

  if(callback) callback(false);
}

// setup polling
function preparePolling(callback) {
  // prepare polling
  // check polling interval
  /*
  if (Number(adapter.config.google_polling_interval)*1000 < min_polling_interval && Number(adapter.config.google_polling_interval) !== 0) {
    adapter.log.error('Polling interval should be greater than ' + min_polling_interval);
  } else if (Number(adapter.config.google_polling_interval) === 0) {
    // query locations is triggered only
    adapter.log.info('Locations poll can be triggered only.');
  } else {
      // enable polling
      google_polling_interval_id = setInterval(function () {
        poll((err) => {
        });
      }, Number(adapter.config.google_polling_interval) * 1000);
  }
  */

  // update credentials
  auth.credentials['google_username'] = adapter.config.google_username;
  auth.credentials['google_password'] = adapter.config.google_password;
  auth.logger = adapter.log;

  auth.connectSimpleChallenge();
  auth.retrieveCookies((err, cookies) => {
    let a = 1;
  });

  if(callback) callback(false);
}

// issue a single query. If not connected, open a new connection
function triggerSingleQuery(callback) {
  // are we already connected to google?
  if (!google_cookie_header) {
    // we have to setup a connection first
    auth.connect(null, adapter.config.google_username, adapter.config.google_password, adapter, function (err, cookieheader) {
      if (err) {
        adapter.log.error('First connection failed.');
        adapter.setState('info.connection', false, false);
      } else {
        adapter.setState('info.connection', true, false);
        google_cookie_header = cookieheader;

        querySharedLocations(function (err) {
          if (err) {
            adapter.log.error('An error occurred during polling the locations!');
            adapter.setState('info.connection', false, false);
            if(callback) callback(err);
          } else {
            adapter.setState('info.connection', true, false);
            if(callback) callback(false);
          }
        });
      }
    });
  } else {
    // connection already active
    querySharedLocations(function (err) {
      if (err) {
        adapter.log.error('An error occurred during polling the locations!');
        adapter.setState('info.connection', false, false);
      } else {
        adapter.setState('info.connection', true, false);
      }
    });
  }
}

// poll locations, devices, etc.
function poll(callback) {
  adapter.log.debug('Polling locations.');

  querySharedLocations((err) => {
    if(err) {
      adapter.log.error('An error occurred during polling the locations!');
      adapter.setState('info.connection', false, false, (err) => {
        if(callback) callback(err);
      });
    } else {
      adapter.setState('info.connection', true, false, (err) => {
        if(callback) callback(false);
      });
    }
  });
}

// full query for shared locations, i.e. call getSharedLocations, check fences etc.
function querySharedLocations(callback) {
  getSharedLocations((err, userobjarr) => {
    if(err) {
      adapter.log.error('An error occurred during getSharedLocation!');
      if (callback) callback(err)
    } else {
      // notify places adapter
      notifyPlaces(userobjarr, function(err) {
        if (err) {
          adapter.log.error('Error during places notification.');
          if (callback) callback(err)
        }
      });

      // check fences
      checkFences(userobjarr, function (err) {
        if (err) {
          adapter.log.error('Error during fence check.');
          if (callback) callback(err)
        } else {
          updateStates(userobjarr, function (err) {
            if (err) {
              if (callback) callback(err)
            } else {
              if (callback) callback(false)
            }
          });
        }
      });
    }
  });
}

// SUBFUNCTIONS FOR QUERYSHAREDLOCATIONS
// check fences
function checkFences(userobjarr, callback) {

  adapter.log.debug('Checking fences.');
  let fences = adapter.config.fences;

  // check fences
  for(let i=0;i<fences.length;i++) {
    let cfence = fences[i];

    // go through all users in the received structure
    for(let j=0;j<userobjarr.length;j++) {
      let cuser = userobjarr[j];

      // check user
      if(cuser.id === cfence.userid) {
        // calc distance
        let curdist = haversine(cuser.lat, cuser.long, Number(cfence.center_lat), Number(cfence.center_long));
        let cstate = curdist <= cfence.radius;

        adapter.setState('fence.' + cfence.fenceid, cstate, false);
        break;
      }
    }
  }

  if(callback) callback(false);
}

// query google shared locations
function getSharedLocations(callback) {
  let options_map = {
    url: "https://www.google.com/maps/preview/locationsharing/read",
    headers: {
      "Cookie": google_cookie_header
    },
    method: "GET",
    qs: {
      "authuser": 0,
      "pb": ""
    }
  };

  request(options_map, (err, response, body) => {
    if(err || !response) {
      // no connection

      adapter.log.error(err);
      adapter.log.error('Connection to google maps failure.');
      if(callback) callback(err);
    } else {
      // connection successful
      adapter.log.debug('Response: ' + response.statusMessage);

      // connection established but auth failure
      if(response.statusCode !== 200) {
        adapter.log.debug('Removed cookies.');
        adapter.log.error('Connection works, but authorization failure, please login manually!');
        adapter.log.error('Could not connect to google, please login manually!');

        if(callback) callback('query shared locations HTTP 200 error');
      } else {
        // parse and save user locations
        let locationdata = JSON.parse(body.split('\n').slice(1, -1).join(''));

        parseLocationData(locationdata, (err, userobjarr) => {
          if(err) {
            if(callback) callback(err);
          } else {
            if(callback) callback(false, userobjarr);
          }
        });
      }
    }
  });
}

// parse the retrieved location data
function parseLocationData(locationdata, callback) {
  // shared location data is contained in the first element
  let perlocarr = locationdata[0];
  let userdataobjarr = [];

  if(perlocarr && perlocarr.length > 0) {
    for(let i=0; i<perlocarr.length;i++) {
      extractUserLocationData(perlocarr[i], function(err, obj) {
        if(err) {
          if(callback) callback(err);
          return;
        } else {
          userdataobjarr[i] = obj;
        }
      });
    }
  } else {
    // no userdata for parsing
    if(callback) callback(false, userdataobjarr);
  }
}

// get user date and create states form
function extractUserLocationData(userdata, callback) {
  let userdataobj = {
    "id": undefined,
    "photoURL": undefined,
    "name": undefined,
    "lat": undefined,
    "long": undefined,
    "address": undefined,
    "battery": undefined,
    "timestamp": undefined,
    "accuracy": undefined
  };

  if(userdata && Array.isArray(userdata)) {
    // userdata present
    if(userdata[0] && userdata[0][0]) userdataobj['id'] = userdata[0][0];
    if(userdata[0] && userdata[0][1]) userdataobj['photoURL'] = userdata[0][1];
    if(userdata[0] && userdata[0][3]) userdataobj['name'] = userdata[0][3];
    if(userdata[1] && userdata[1][1] && userdata[1][1][2]) userdataobj['lat'] = userdata[1][1][2];
    if(userdata[1] && userdata[1][1] && userdata[1][1][1]) userdataobj['long'] = userdata[1][1][1];
    if(userdata[1] && userdata[1][4]) userdataobj['address'] = userdata[1][4];
    if(userdata[13] && userdata[13][1]) userdataobj['battery'] = userdata[13][1];
    if(userdata[1] && userdata[1][2]) userdataobj['timestamp'] = userdata[1][2];
    if(userdata[1] && userdata[1][3]) userdataobj['accuracy'] = userdata[1][3];
  }

  if(callback) callback(false, userdataobj);
}

// update states
function updateStates(userobjarr, callback) {

  if(userobjarr) {
    for(let i=0;i<userobjarr.length;i++) {
      // go through users
      for(let cprop in userobjarr[i]) {
        // we have a user, create the group
        let username = '';

        if (userobjarr[i].hasOwnProperty('name') && userobjarr[i]['name']) username = userobjarr[i]['name'];

        let obj = {
          "_id": "user." + userobjarr[i].id,
          "type": "",
          "common": {
            "name": username
          },
          "native": {}
        };
        adapter.setObjectNotExists('user.' + userobjarr[i].id, obj);

        if(userobjarr[i].hasOwnProperty(cprop)) {
          // cur properties
          let cid = 'user.' + userobjarr[i].id + '.' + cprop;
          let crole = 'state'; // default role
          let cunit = ''; // default unit

          switch(typeof userobjarr[i][cprop]) {
            case 'number':
              switch(cprop) {
                case 'lat':
                  crole = 'value.gps.latitude';
                  break;
                case 'long':
                  crole = 'value.gps.longitude';
                  break;
                case 'battery':
                  crole = 'value.battery';
                  cunit = '%';
                  break;
                case 'accuracy':
                  crole = 'value';
                  cunit = 'm';
                  break;
                case 'timestamp':
                  crole = 'date';
                  break;
                default:
                  crole = 'value';
              }
              setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'number',
                  role: crole,
                  unit: cunit,
                  read: 'true',
                  write: 'false'
                }
              }, userobjarr[i][cprop], true);
              break;
            case 'string':
              switch(cprop) {
                case 'photoURL':
                  crole = 'text.url';
                  break;
                case 'address':
                  crole = 'location';
                  break;
                default:
                  crole = 'text';
              }
              setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'string',
                  role: crole,
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
                  role: 'indicator',
                  def: 'false',
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

// notify places adapter
function notifyPlaces(userobjarr, callback) {
  let places = adapter.config.places_adapter;

  if (places && places !== '') {
    // go through all users
    for(let j=0;j<userobjarr.length;j++) {
      let cuser = userobjarr[j];

      // send message to places adapter
      adapter.sendTo(
        places, {
          user: cuser.name,
          latitude: cuser.lat,
          longitude: cuser.long,
          timestamp: Date.now()
        });
    }
  }

  if(callback) callback(false);
}

// HELPER FUNCTIONS
// if the state does not exist, create it and set its value
function setStateEx(id, common, val, ack, callback) {
  let a = {
    type: 'state',
    native: {}
  };

  let common_full = Object.assign({}, a, common);
  let _id = id;
  let _val = val;
  let _ack = ack;

  adapter.setObjectNotExists(id, common_full, (err) => {
    if(err) {
      adapter.log.error('Could not create extended state id:' + _id + ', val:' + _val);
      if(callback) callback(err);
    } else {
      adapter.setState(_id, _val, _ack, (err) => {
        if(err) {
          adapter.log.error('Could not set extended state id:' + _id + ', val:' + _val);
          if(callback) callback(err);
        } else {
          // all fine
          if(callback) callback(false);
        }
      });
    }
  });
}

// calculate distance between two coordinates in decimal notation
function haversine(deg_lat1, deg_lon1, deg_lat2, deg_lon2) {
  let lat1 = deg_lat1/180*Math.PI;
  let lon1 = deg_lon1/180*Math.PI;
  let lat2 = deg_lat2/180*Math.PI;
  let lon2 = deg_lon2/180*Math.PI;

  const R = 6372.8;
  let dLat = lat2 - lat1;
  let dLon = lon2 - lon1;

  let a = Math.sin(dLat / 2) * Math.sin(dLat /2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon /2);
  return 2.0 * R * Math.asin(Math.sqrt(a)) * 1000;
}
