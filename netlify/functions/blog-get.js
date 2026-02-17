// netlify/functions/blog-get.js
// API publique — lit les articles du blog depuis Neon (GET)
// Accessible via : /.netlify/functions/blog-get
'use strict';

const { neon, neonConfig } = require('@neondatabase/serverless');
neonConfig.fetchConnectionCache = true;

const connectionString =
  process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || '';

const json = (statusCode, data) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  },
  body: JSON.stringify(data, null, 2),
});

exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    if (event.httpMethod !== 'GET')     return json(405, { error: 'Method Not Allowed' });

    if (!connectionString) {
      return json(500, { error: 'Missing NETLIFY_DATABASE_URL (or DATABASE_URL)' });
    }

    const sql = neon(connectionString);

    const rows = await sql`
      SELECT
        id,
        titre,
        contenu,
        langue,
        resume,
        date_publication,
        publie,
        cree_le
      FROM public.articles
      WHERE publie = true
      ORDER BY date_publication DESC
    `;

    return json(200, rows);

  } catch (err) {
    console.error('blog-get error:', err);
    return json(500, { error: 'Server error' });
  }
};
