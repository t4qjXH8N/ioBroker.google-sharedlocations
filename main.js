"use strict";

const auth = require(__dirname + '/lib/google_auth');

// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// for communication
const request = require('request');

const min_polling_interval = 30; // minimum polling interval in seconds

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.google-sharedlocations.0
const adapter = utils.adapter('google-sharedlocations');

let google_polling_interval_id = null;
let google_cookie_header = null;

// triggered when the adapter is installed
adapter.on('install', function () {
  // create connection variable https://github.com/ioBroker/ioBroker/wiki/Adapter-Development-Documentation#infoconnection
});

// is called when the adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
  try {
    // logout from google
    auth.logout(function (err) {
      if (err) {
        adapter.log.error('Could not logout from google when unloading the adapter.');
        callback(err);
      }
    });

    adapter.log.info('cleaned everything up...');
  } catch (e) {
    callback(e);
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

// messages
adapter.on('message', function (obj) {
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

        auth.connect(credentials.google_username, credentials.google_password, credentials.google_verify_email, function(err, cookieheader) {
          if(!err) {
            // after the query, issue a logout
            auth.logout();

            adapter.sendTo(obj.from, obj.command, true, obj.callback);
          } else {
            adapter.sendTo(obj.from, obj.command, false, obj.callback);
          }
        });
        wait = true;
        break;
      case 'getUsers':
        connected = false;
        credentials = JSON.parse(obj.message);

        auth.connect(credentials.google_username, credentials.google_password, credentials.google_verify_email, function(err, cookieheader) {
          if(!err) {
            connected = true;
            google_cookie_header = cookieheader;

            querySharedLocations(function (err) {
              if (!err) {
                DBUsersToSendTo(function (res) {
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
        DBUsersToSendTo(function (res) {
          adapter.sendTo(obj.from, obj.command, res, obj.callback);
        });
        wait = true;
        break;
      default:
        adapter.log.warn("Unknown command: " + obj.command);
        break;
    }
  }
  if (!wait && obj.callback) {
    adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
  }

  return true;
});


// main function
function main() {
  // The adapters config (in the instance object everything under the attribute "native") is accessible via
  // adapter.config:
  adapter.log.info('Starting google shared locations adapter');

  // check polling interval
  if (Number(adapter.config.google_polling_interval)*1000 < min_polling_interval) {
    adapter.log.error('Polling interval should be greater than ' + min_polling_interval);
  } else {
    // first connect and query
    // connect to Google
    if(adapter.config.google_username && adapter.config.google_username !== ''
      && adapter.config.google_password && adapter.config.google_password !== ''
      && adapter.config.google_verify_email && adapter.config.google_verify_email !== '') {
      auth.connect(adapter.config.google_username, adapter.config.google_password, adapter.config.google_verify_email, function (err, cookieheader) {
        if (err) {
          adapter.log.error('First connection failed.');
          adapter.setState('info.connection', false, false);
        } else {
          adapter.setState('info.connection', true, false);
          google_cookie_header = cookieheader;

          querySharedLocations(function (err) {
          });

          // enable polling
          google_polling_interval_id = setInterval(function () {
            poll(function (err) {
            });
          }, Number(adapter.config.google_polling_interval) * 1000);
        }
      });
    }

    // google subscribes to all state changes
    adapter.subscribeStates('info.connection');
    adapter.subscribeStates('fence.*');
  }
}

// get locations
function querySharedLocations(callback) {
  getSharedLocations(function (err, userobjarr) {
    if (err) {
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

// update states
function updateStates(userobjarr, callback) {

  if(userobjarr) {
    for(let i=0;i<userobjarr.length;i++) {
      // go through users
      for(let cprop in userobjarr[i]) {
        if(userobjarr[i].hasOwnProperty(cprop)) {
          // cur properties
          let cid = 'user.' + userobjarr[i].id + '.' + cprop;

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

// poll locations, devices, etc.
function poll(callback) {

  adapter.log.info('Polling locations.');

  querySharedLocations(function (err) {
    if (err) {
      adapter.log.error('An error occurred during polling the locations!');
      adapter.setState('info.connection', false, false);
      callback(err);

      // TODO: should we issue a reconnect here?
    } else {
      adapter.setState('info.connection', true, false);
      callback(false);
    }
  });
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

  callback(false);
}

// check fences
function checkFences(userobjarr, callback) {

  adapter.log.info('Checking fences.');
  let fences = adapter.config.fences;

  // check fences
  for(let i=0;i<fences.length;i++) {
    let cfence = fences[i];

    // go through all users
    for(let j=0;j<userobjarr.length;j++) {
      let cuser = userobjarr[j];

      // check user
      if(cuser.id === cfence.userid) {
        // calc distance
        let curdist = haversine(cuser.lat, cuser.long, Number(cfence.center_lat), Number(cfence.center_long));
        let fenceid = 'fence.' + i;

        let cstate = curdist <= cfence.radius;

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
  let a = {
    type: 'state',
    native: {}
  };

  let common_full = Object.assign({}, a, common);

  let cfunc = function (err) {
    adapter.setState(id, val, ack, function(err) {
      if(err) adapter.log.error('Could not create extended state id:' + id + ', val:' + val);
    });
  };

  adapter.setObject(id, common_full, cfunc);

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
        adapter.log.debug('Removed cookies.');
        adapter.log.error('Connection works, but authorization failure (cookie not valid?)!');

        if(callback) callback(true);
      } else {
        // parse and save user locations
        let locationdata = JSON.parse(body.split('\n').slice(1, -1).join(''));

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
          return
        } else {
          userdataobjarr[i] = obj;
        }
      });
    }

  }

  if(callback) callback(false, userdataobjarr);
}

// get user date and create states form
function extractUserLocationData(userdata, callback) {

  let userdataobj = {};
  // location data present?
  if(!userdata[1]) {
    // no userdata present

    userdataobj = {
      "id": userdata[0][0],
      "photoURL": userdata[0][1],
      "name": userdata[0][3],
      "lat": undefined,
      "long": undefined,
      "address": undefined
    }
  } else {
    // userdata present

    userdataobj = {
      "id": userdata[0][0],
      "photoURL": userdata[0][1],
      "name": userdata[0][3],
      "lat": userdata[1][1][2],
      "long": userdata[1][1][1],
      "address": userdata[1][4]
    }
  }

  if(callback) callback(false, userdataobj);
}

// latitude and longitude in degree decimal notation
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
