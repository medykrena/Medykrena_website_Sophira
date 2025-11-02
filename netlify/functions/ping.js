// netlify/functions/ping.js
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ok: true, msg: 'functions alive' })
  };
};
