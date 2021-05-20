"use strict";

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils

// for communication
const axios = require('axios');

const min_polling_interval = 60; // minimum polling interval in seconds

const trigger_poll_state = 'trigger_poll';  // state for triggering a poll

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.google-sharedlocations.0
const adapter = new utils.adapter('google-sharedlocations');

let google_polling_interval_id = null;
let google_cookie_header;

// triggered when the adapter is installed
adapter.on('install', function () {
  // create connection variable https://github.com/ioBroker/ioBroker/wiki/Adapter-Development-Documentation#infoconnection
});

// is called when the adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
  try {
    if (google_polling_interval_id) {
      clearTimeout(google_polling_interval_id);
    }
    callback();
  } catch (e) {
    callback(e);
  }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
  // Warning, obj can be null if it was deleted
  //adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {

  if (state && !state.ack) {
    // a poll is triggered
    if (id && state && id === 'google-sharedlocations.' + adapter.instance + '.' + trigger_poll_state && state.val === true) {
      adapter.log.debug('Poll triggered by user.');
      querySharedLocations();
      adapter.setState(trigger_poll_state, false, false)
    }
  }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
  // start main function
  main();
});

// messages
adapter.on('message', async function (obj) {
  let wait = false;
  let credentials;

  async function DBUsersToSendTo() {
    const ids = [];
    try {
      // get users
      const states = adapter.getStatesAsync('google-sharedlocations.' + adapter.instance + '.user.*');
      for (const cstate of states) {
        if (cstate.split('.')[cstate.split('.').length - 1] === 'id') {
          ids.push(cstate.split('.')[cstate.split('.').length - 2]);
        }
      }
      // get photo urls
      const res = [];
      for (const id of ids) {
        res.push({
          "id": id,
          "photoURL": states['google-sharedlocations.' + adapter.instance + '.user.' + id + '.photoURL'].val,
          "name": states['google-sharedlocations.' + adapter.instance + '.user.' + id + '.name'].val
        });
      }

      return res;
    } catch (err) {
      adapter.log.error('Error during setting states: ' + err);
      return [];
    }
  }


  if (obj) {
    switch (obj.command) {
      case 'checkConnection': {
        const cookie = obj.message.cookie;
        if (cookie) {
          google_cookie_header = cookie;
        }

        try {
          const result = await getSharedLocations();
          adapter.sendTo(obj.from, obj.command, result ? true : false, obj.callback);
        } catch (err) {
          adapter.sendTo(obj.from, obj.command, false, obj.callback);
        }
        break;
      }
      case 'triggerPoll': {
        await querySharedLocations();
        adapter.sendTo(obj.from, obj.command, err, obj.callback);
        break;
      }
      case 'getUsers': {
        const cookie = obj.message.cookie;
        if (cookie) {
          google_cookie_header = cookie;
        }

        await querySharedLocations();
        const res = await DBUsersToSendTo();
        adapter.sendTo(obj.from, obj.command, res, obj.callback);
        break;
      }
      case 'getUsersFromDB': {
        // get users
        const res = await DBUsersToSendTo();
        adapter.sendTo(obj.from, obj.command, res, obj.callback);
        break;
      }
      default: {
        adapter.log.warn("Unknown command: " + obj.command);
        if (obj.callback) {
          adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
        }
        break;
      }
    }
  }

  return true;
});

// synchronize config
async function syncConfig() {
  //retrieve iobroker states of this adapter:
  const states = await adapter.getStatesAsync('google-sharedlocations.' + adapter.instance + '.fence.*');

  function stateInConfig(stateId) {
    let fences = adapter.config.fences;
    for (let j = 0; j < fences.length; j++) {
      if ('google-sharedlocations.' + adapter.instance + '.fence.' + fences[j].fenceid === stateId) {
        return true;
      }
    }
    return false;
  }

  function stateInDB(stateId) {
    return !!states[stateId];
  }

  // check if there are states that have to be removed
  for (const stateId of Object.keys(states)) {
    if (!stateInConfig(stateId)) {
      await adapter.delObjectAsync(stateId);
    }
  }

  let fences = adapter.config.fences;
  // create missing states
  for (let i = 0; i < fences.length; i++) {
    const inDB = await stateInDB('google-sharedlocations.' + adapter.instance + '.fence.' + fences[i].fenceid);
    if (!inDB) {
      // set all states to false at the beginning and create them if they do not exist
      await setStateEx('fence.' + fences[i].fenceid, {
        common: {
          name: fences[i].description,
          desc: 'Fence for user ' + fences[i].userid,
          type: 'boolean',
          role: 'indicator',
          def: false,
          read: true,
          write: false
        }
      }, false, true);
    }
  }
}

async function poll(onlyCookie) {
  try {
    const state = await adapter.getStateAsync('info.augmented_cookie');
    if (Date.now() - state.ts >= 24 * 60 * 60 * 1000) {
      adapter.log.debug('Need to augment cookie.');
      await improveCookie();
      await improveCookie();
      await adapter.setStateAsync('info.augmented_cookie', google_cookie_header, true);
    }
  } catch (e) {
    adapter.log.warn('Error during cookie augmentation: ' + err);
  }

  if (!onlyCookie) {
      try {
        adapter.log.debug('Polling locations.');
        await querySharedLocations();
      } catch (err) {
        adapter.log.warn('Error during poll: ' + err);
    }
  }

  google_polling_interval_id = setTimeout(poll, onlyCookie ? 24 * 60 * 60 * 1000 //24h or pollinterval.
      : Number(adapter.config.google_polling_interval) * 1000)
}

// main function
async function main() {
  // The adapters config (in the instance object everything under the attribute "native") is accessible via
  // adapter.config:
  adapter.log.info('Starting google shared locations adapter');

  //TODO: maybe do that, too, in order to extend cookie:
  // https://github.com/costastf/locationsharinglib/blob/master/locationsharinglib/locationsharinglib.py#L105
  // i.e. get account URL and store cookies from that?

  // sync config
  await syncConfig();

  // check polling interval
  if (Number(adapter.config.google_polling_interval) < min_polling_interval && Number(adapter.config.google_polling_interval) !== 0) {
    adapter.log.info('Configured poll interval of ' + adapter.config.google_polling_interval + 's smaller than minimum poll interval of ' + min_polling_interval + 's, will increase it to prevent 429 errors.');
    adapter.config.google_polling_interval = min_polling_interval;
  }

  if(adapter.config.google_cookie) {
    google_cookie_header = adapter.config.google_cookie.replace('Cookie: ', '');
    poll(true);
  } else {
    adapter.log.warn('No cookie. Please set cookie in config.');
  }

  if (Number(adapter.config.google_polling_interval) === 0) {
    // query locations is triggered only
    adapter.log.info('Polling disabled, enable cookie refresh only.');
    poll(true);
  } else {
    // first connect and query
    // connect to Google
    adapter.log.debug('Polling location every ' + adapter.config.google_polling_interval + 's.');
    // enable polling
    poll(false);
  }
  // subscribe
  adapter.subscribeStates(trigger_poll_state);
  //adapter.subscribeStates('fence.*');
}

// get locations
async function querySharedLocations() {
  try {
    const userobjarr = await getSharedLocations();
    // notify places adapter
    await notifyPlaces(userobjarr);

    // check fences
    await checkFences(userobjarr);
    await updateStates(userobjarr);

    adapter.setState('info.connection', true, true);
  } catch (err) {
    adapter.log.error('An error occurred during polling the locations: ' + err.stack);
    adapter.setState('info.connection', false, true);
  }
}

// update states
async function updateStates(userobjarr) {
  if(userobjarr) {
    for(let i=0;i<userobjarr.length;i++) {
      // go through users
      for(let cprop in userobjarr[i]) {
        // we have a user, create the group
        let username = '';

        if (userobjarr[i].hasOwnProperty('name') && userobjarr[i]['name']) username = userobjarr[i]['name'];

        let obj = {
            "_id": "user." + userobjarr[i].id,
            "type": "device",
            "common": {
            "name": username
          },
            "native": {}
          };
        await adapter.setObjectNotExistsAsync('user.' + userobjarr[i].id, obj);

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
                  crole = 'value.gps.accuracy';
                  cunit = 'm';
                  break;
                case 'timestamp':
                  crole = 'date';
                  break;
                default:
                  crole = 'value';
              }
              await setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'number',
                  role: crole,
                  unit: cunit,
                  read: true,
                  write: false
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
              await setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'string',
                  role: crole,
                  read: true,
                  write: false
                }
              }, userobjarr[i][cprop], true);
              break;
            case 'boolean':
              await setStateEx(cid, {
                common: {
                  name: cprop,
                  desc: '',
                  type: 'boolean',
                  role: 'indicator',
                  def: false,
                  read: true,
                  write: false
                }
              }, userobjarr[i][cprop], true);
              break;
          }
        }
      }
    }
  }
}

// notify places adapter
async function notifyPlaces(userobjarr) {
  let places = adapter.config.places_adapter;

  if (places && places !== '') {
    // go through all users
    for(let j=0;j<userobjarr.length;j++) {
      let cuser = userobjarr[j];

      // send message to places adapter
      await adapter.sendToAsync(
        places, {
          user: cuser.name,
          latitude: cuser.lat,
          longitude: cuser.long,
          timestamp: Date.now(),
          address: cuser.address
        });
    }
  }
}

// check fences
async function checkFences(userobjarr) {
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

        await adapter.setStateAsync('fence.' + cfence.fenceid, cstate, true);
        break;
      }
    }
  }
}

// setStateEx
async function setStateEx(id, common, val, ack) {
  let a = {
    type: 'state',
    native: {}
  };

  let common_full = Object.assign({}, a, common);
  try {
    await adapter.setObjectNotExistsAsync(id, common_full);
    await adapter.setStateAsync(id, val, ack);
  } catch (err) {
    adapter.log.warn(`Could not update state ${id} because: ${err}`);
  }
}

/**
 * Tries to improve user cookie by logging in to user home first.
 * @returns {Promise<void>}
 */
async function improveCookie() {
  //see https://github.com/costastf/locationsharinglib/blob/master/locationsharinglib/locationsharinglib.py#L105
  let options_map = {
    url: "https://myaccount.google.com/?hl=en",
    headers: {
      "Cookie": google_cookie_header
    },
    method: "get"
  };

  try {
    const response = await axios(options_map);
    // connection successful
    adapter.log.debug('Response: ' + response.status);

    // connection established but auth failure
    if (response.status !== 200) {
      adapter.log.error('Failed getting locations: ' + response.status);
    } else {
      // parse and save user locations
      adapter.log.debug('New cookie header: ' + response.headers['set-cookie'].length);
      if (response.headers['set-cookie'].length) {
        adapter.log.info('New header received.');
        for (const header of response.headers['set-cookie']) {
          google_cookie_header += header;
        }
      }
    }
  } catch (err) {
    adapter.log.error(err);
    adapter.log.info('Connection to google maps failure.');
    return false;
  }
}

// query google shared locations
async function getSharedLocations() {
  //see https://github.com/costastf/locationsharinglib/blob/master/locationsharinglib/locationsharinglib.py#L148
  let options_map = {
    url: "https://www.google.com/maps/rpc/locationsharing/read",
    headers: {
      "Cookie": google_cookie_header
    },
    method: "get",
    params: {
      "authuser": 2,
      "hl": "en",
      "gl": "us",
      //pb is place on map. Is irrelevant, set to google head quarters here.
      "pb": "!1m7!8m6!1m3!1i14!2i8413!3i5385!2i6!3x4095!2m3!1e0!2sm!3i407105169!3m7!2sen!5e1105!12m4!1e68!2m2!1sset!2sRoadmap!4e1!5m4!1e4!8m2!1e0!1e1!6m9!1e12!2i2!26m1!4b1!30m1!1f1.3953487873077393!39b1!44e1!50e0!23i4111425"
    }
  };

  try {
    const response = await axios(options_map);
    // connection successful
    adapter.log.debug('Response: ' + response.status);

    // connection established but auth failure
    if (response.status !== 200) {
      adapter.log.error('Failed getting locations: ' + response.status + ' - ' + response.data);
    } else {
      // parse and save user locations
      try {
        let locationdata = JSON.parse(response.data.split('\n').slice(1, -1).join(''));
        const userobjarr = parseLocationData(locationdata);
        return userobjarr;
      } catch (e) {
        adapter.log.error('Could not parse location data. Probably authentication error. Please check cookie.');
        return false;
      }
    }
  } catch (err) {
    adapter.log.error(err);
    adapter.log.info('Connection to google maps failure.');
    return false;
  }
}

// parse the retrieved location data
function parseLocationData(locationdata) {

  // shared location data is contained in the first element
  const perlocarr = locationdata[0];
  const userdataobjarr = [];

  if(perlocarr && perlocarr.length > 0) {
    for(const perloc of perlocarr) {
      const obj = extractUserLocationData(perloc);
      userdataobjarr.push(obj);
    }
  } else {
    throw new Error('No location data in response. Cookie expired or no users share their location with you.');
    adapter.log.debug('No location data: ' + JSON.stringify(locationdata, null, 2));
  }

  return userdataobjarr;
}

// get user date and create states form
function extractUserLocationData(userdata) {
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

  return userdataobj;
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
