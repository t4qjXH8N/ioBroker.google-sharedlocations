/**
 * Module dependencies.
 */
const express = require('express');
const proxy = require('http-proxy-middleware');

/**
 * Configure proxy middleware
 */
let jsonPlaceholderProxy = proxy({
    target: 'https://accounts.google.com/',
    port: 443,
    changeOrigin: true,
    logLevel: 'debug',
    secure: true,
    ws: true,
    onProxyRes: onProxyRes,
    decorateRequest: (proxyReq) => {
      console.log("Cookie", proxyReq.headers.cookie);
      return proxyReq;
    },
    intercept: (rsp, data, req, res, callback) => {
      // rsp - original response from the target
      console.log("set-cookie", rsp.headers['set-cookie']);
      callback(null, data);
    },
    autoRewrite: true
    //cookieDomainRewrite: "localhost"
  }
);

let app = express();

/**
 * Add the proxy to express
 */
app.use('/', jsonPlaceholderProxy);

app.listen(3000);

console.log('[DEMO] Server: listening on port 3000');
console.log('[DEMO] Opening: http://localhost:3000/');

//require('opn')('http://localhost:3000/users');
//
// Listen for the `proxyRes` event on `proxy`.
//
function onProxyRes(proxyRes, req, res) {
  //console.log('RAW Response from the target', JSON.stringify(proxyRes.headers, true, 2));
}
