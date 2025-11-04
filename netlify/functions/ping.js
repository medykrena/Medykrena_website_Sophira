// netlify/functions/ping.js
'use strict';

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ ok: true, msg: 'functions alive' })
  };
};
