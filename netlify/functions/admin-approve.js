// netlify/functions/admin-approve.js
// Toggle approval for a candidate: POST JSON { id:<uuid>, approved:true|false }
// Auth: ADMIN_TOKEN (header X-Admin-Token or query ?token=)

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
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  },
  body: JSON.stringify(data),
});

exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    if (event.httpMethod !== 'POST')    return json(405, { error: 'Method Not Allowed' });

    if (!connectionString) {
      return json(500, { error: 'Missing NETLIFY_DATABASE_URL (or DATABASE_URL)' });
    }

    // Auth
    const hdrs = event.headers || {};
    const tokenHeader = hdrs['x-admin-token'] || hdrs['X-Admin-Token'];
    const tokenQuery  = event.queryStringParameters?.token || null;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    if (!ADMIN_TOKEN || (tokenHeader !== ADMIN_TOKEN && tokenQuery !== ADMIN_TOKEN)) {
      return json(401, { error: 'Unauthorized' });
    }

    // Body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { error: 'Invalid JSON body' }); }

    const id = body.id;
    const approved = typeof body.approved === 'boolean' ? body.approved : true;
    if (!id) return json(400, { error: 'Missing id' });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return json(400, { error: 'Invalid id format (UUID expected)' });

    // DB
    const sql = neon(connectionString);
    const res = await sql/*sql*/`
      UPDATE public.candidats
      SET approved = ${approved}
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, approved
    `;

    if (res.length === 0) return json(404, { error: 'Not found' });

    // Optional audit log
    try {
      await sql/*sql*/`
        INSERT INTO public.audit_logs(level, message, context)
        VALUES (
          'info',
          'candidate_approval_changed',
          jsonb_build_object('id', ${id}, 'approved', ${approved})
        )
      `;
    } catch (e) {
      console.warn('audit_logs skipped:', e.message);
    }

    return json(200, { ok: true, id, approved });
  } catch (err) {
    console.error('admin-approve error:', err);
    return json(500, { error: 'Server error' });
  }
};
