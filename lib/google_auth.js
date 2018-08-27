"use strict";

// for parsing forms
const cheerio = require('cheerio');

// for communication
const request = require('request');

// google cookies
let google_cookies = {
  "google.com": {}
};

// google form data
let google_form = {};

let config = {
  "google_username": "",
  "google_password": "",
  "google_verify_email":  ""
};

// establish connection to google
exports.connect =  function(google_username, google_password, google_verify_email, callback) {

  config.google_username = google_username;
  config.google_password = google_password;
  config.google_verify_email = google_verify_email;

  connectFirstStage(function (err) {
    if (err) {
      if (callback) callback(err);
    } else {
      // no error
      connectSecondStage(function (err) {
        if (err) {
          if (callback) callback(err);
        } else {
          connectThirdStage(function (err) {
            if (err) {
              if (callback) callback(err);
            } else {
              if (callback) callback(false, getCookieHeader('google.com'));
            }
          });
        }
      });
    }
  });
};

// connect to Google, call login page
// what we get here:
// GAPS cookie
// glx form identifier
function connectFirstStage(callback) {
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

  request(options_connect1, function(err, response, body) {
    if(err || !response) {
      // no connection
      if(callback) callback(err);
    } else {
      // connection successful

      // connection established but something went wrong
      if(response.statusCode !== 200) {
        if(callback) callback('First stage error, could not retrieve cookie or glx!');
      } else {
        // save cookies etc.
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          saveConnectionCookies(response.headers['set-cookie'], 'google.com');
        }

        // first simply get all form fields
        const $ = cheerio.load(response.body);
        google_form = serialized_array_to_dict($("form").serializeArray())[0];

        if(callback) callback(false);
      }
    }
  });
}

// we have the GAPS cookie and the glx identifier,
// start username nad password challenge now
function connectSecondStage(callback) {
  google_form['Email'] = config.google_username;

  let options_connect2 = {
    url: "https://accounts.google.com/signin/v1/lookup",
    headers: {
      "Cookie": getCookieHeader('google.com')
    },
    method: "POST",
    form: google_form
  };

  request(options_connect2, function(err, response, body){
    if(err || !response) {
      // no connection
      if(callback) callback(err);
    } else {
      // connection successful
      // save cookies etc.
      if(response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
        saveConnectionCookies(response.headers['set-cookie'], 'google.com');
      }

      // first simply get all form fields
      const $ = cheerio.load(response.body);
      google_form = serialized_array_to_dict($("form").serializeArray());

      if (callback) callback(false);
    }
  });
}

// we have the GAPS cookie and the glx identifier,
// start username nad password challenge now
function connectThirdStage(callback) {
  google_form['Passwd'] = config.google_password;

  let options_connect3 = {
    url: "https://accounts.google.com/signin/challenge/sl/password",
    headers: {
      "Cookie": getCookieHeader('google.com')
    },
    method: "POST",
    form: google_form
  };

  request(options_connect3, function(err, response, body){
    if(err || !response) {
      // no connection
      if(callback) callback(err);
    } else {
      // connection successful
      // update cookies
      if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
        saveConnectionCookies(response.headers['set-cookie'], 'google.com');
      }

      if (response.headers.hasOwnProperty('set-cookie') && response.headers['set-cookie'].length > 1) {
        // password challenge fine

        if (callback) callback(false);
      } else {
        // password challenge or something similar went wrong
        // maybe google needs an additional verification?

        connectAdditionalVerification(response, function (err) {
          if(err) {
            callback(err);
          } else {
            callback(false);
          }
        });
      }

    }
  });
}

function connectAdditionalVerification(response, callback) {
  // check if google send a location
  if (!response.headers.hasOwnProperty('location')) {
    // that is a problem, google checks for a human, or an additional verification
    callback(true);
    return
  }

  // open location in the response
  let options_connect_veri = {
    url: response.headers.location,
    headers: {
      "Cookie": getCookieHeader('google.com')
    },
    method: "GET"
  };

  request(options_connect_veri, function(err, response, body) {
    if (err || !response) {
      // no connection
      if (callback) callback(err);
    } else {
      // connection successful
      // update cookies
      if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
        saveConnectionCookies(response.headers['set-cookie'], 'google.com');
      }

      // analyze the form
      const $ = cheerio.load(response.body);
      let google_veri_form = serialized_array_to_dict($("form").serializeArray());

      // ATTENTION: there a two possibilities:
      // 1. we can enter the verify email directly or
      // 2. we first have to select it.
      // if 2. is true, there is a button with subaction select challenge in the form

      // check if there is a subaction called "selectChallenge"
      let found = -1;
      for (let i = 0; i < google_veri_form.length; i++) {
        if (("subAction" in google_veri_form[i]) && (google_veri_form[i]["subAction"] === "selectChallenge")) {
          found = i;
          break;
        }
      }

      if (found >= 0) {
        // select enter email
        let options_connect_veri_email = {
          url: "https://accounts.google.com/signin/challenge/kpe/4",
          headers: {
            "Cookie": getCookieHeader('google.com')
          },
          method: "POST",
          form: google_veri_form[found]
        };

        request(options_connect_veri_email, function (err, response, body) {
          if (err || !response) {
            // no connection
            if (callback) callback(err);
          } else {
            // connection successful
            // update cookies
            if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
              saveConnectionCookies(response.headers['set-cookie'], 'google.com');
            }

            connectEnterVerificationEmail(response.headers.location, function (err) {
              if(err) {
                callback(err);
              } else {
                callback(false);
              }
            });
          }
        });
      } else {

        // simply enter the verification mail
        connectEnterVerificationEmail(response.headers.location, function (err) {
          callback(err);
        });
      }

    }
  });
}

function connectEnterVerificationEmail(location, callback) {
  // first switch to the url where the email has to be entered
  // we received the page where we have to enter the verification email
  let options_connect_veri_email = {
    url: location,
    headers: {
      "Cookie": getCookieHeader('google.com')
    },
    method: "GET"
  };

  request(options_connect_veri_email, function (err, response, body) {
    if (err || !response) {
      // no connection
      if (callback) callback(err);
    } else {
      // update cookies
      if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
        saveConnectionCookies(response.headers['set-cookie'], 'google.com');
      }

      // analyze the form
      const $ = cheerio.load(response.body);
      let google_veri_form = serialized_array_to_dict($("form").serializeArray())[0];

      // simply enter the email
      // enter verify email address
      google_veri_form["email"] = config.google_verify_email;

      let options_connect_veri_email = {
        url: "https://accounts.google.com/signin/challenge/kpe/4",
        headers: {
          "Cookie": getCookieHeader('google.com')
        },
        method: "POST",
        form: google_veri_form
      };

      request(options_connect_veri_email, function (err, response, body) {
        if (err || !response) {
          // no connection
          if (callback) callback(err);
        } else {
          // successful
          if (response.headers.hasOwnProperty('set-cookie') && response.headers['set-cookie'].length > 1) {
            if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
              saveConnectionCookies(response.headers['set-cookie'], 'google.com');
            }

            if (callback) callback(false);
          } else {
            if (callback) callback('An error occurred after entering the verify email!');
          }

        }
      });
    }
  });
}

// compose the header cookie data
function getCookieHeader(domain) {
  let cookiestr = '';
  for(let curcookie in google_cookies[domain]) {
    cookiestr = cookiestr + curcookie + '=' + google_cookies[domain][curcookie] + ';'
  }

  return cookiestr.slice(0, -1);
}

// save cookies from google
function saveConnectionCookies(setcookies, domain) {

  for(let i=0; i<setcookies.length;i++) {
    let key = setcookies[i].split(';')[0].split('=')[0];
    let val = setcookies[i].split(';')[0].split('=')[1];

    google_cookies[domain][key] = val;
  }
}

// logout from google
exports.logout = function (callback) {

  getCookieHeader('google.com', function(err, cookieheader) {

    let options_map = {
      url: "https://accounts.google.com/logout",
      headers: {
        "Cookie": cookieheader
      },
      method: "GET"
    };

    request(options_map, function(err, response, body){
      if(err || !response) {
        // no connection
        if(callback) callback(err);
      } else {
        // connection successful
        // connection established but auth failure
        if(response.statusCode !== 200) {
          if(callback) callback("Logout failed!");
        } else {
          // parse and save user locations
          if(callback) callback(false);
        }
      }
    });
  });
};

function serialized_array_to_dict(arr) {
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