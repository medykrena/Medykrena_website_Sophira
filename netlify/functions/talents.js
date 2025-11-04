// netlify/functions/talents.js
// Anonymized list of approved Sophira candidates (GET)
// Supports optional ?limit= (1..100). CORS-friendly.

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

    // Optional limit param
    const qp = event.queryStringParameters || {};
    let limit = Number(qp.limit || 50);
    if (!Number.isFinite(limit)) limit = 50;
    limit = Math.max(1, Math.min(100, Math.floor(limit)));

    const sql = neon(connectionString);

    const rows = await sql/*sql*/`
      SELECT 
        id,
        submitted_at,
        domaine,
        competences,
        bio,
        ville
      FROM public.candidats
      WHERE approved = true
        AND (deleted_at IS NULL)
      ORDER BY submitted_at DESC
      LIMIT ${limit};
    `;

    const result = rows.map((r) => ({
      id: r.id,
      domaine: r.domaine,
      competences: r.competences
        ? r.competences.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      bio: r.bio ? (r.bio.length > 180 ? r.bio.slice(0, 180) + '…' : r.bio) : '',
      ville: r.ville || '',
      date: r.submitted_at
        ? new Date(r.submitted_at).toLocaleDateString('fr-CH')
        : '',
    }));

    return json(200, result);
  } catch (err) {
    console.error('talents error:', err);
    return json(500, { error: 'Server error' });
  }
};
