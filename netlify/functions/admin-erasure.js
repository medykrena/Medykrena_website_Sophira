// netlify/functions/admin-erasure.js
// Effacement (LPD/RGPD): soft-delete un candidat ou supprime ses PII.
// Auth: ADMIN_TOKEN (header X-Admin-Token ou query ?token=)

'use strict';

const { neon, neonConfig } = require('@neondatabase/serverless');
neonConfig.fetchConnectionCache = true;

const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

const json = (statusCode, data) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  },
  body: JSON.stringify(data)
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    if (event.httpMethod !== 'POST')   return json(405, { error: 'Method Not Allowed' });

    const tokenHeader = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    const tokenQuery  = event.queryStringParameters?.token || null;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN || (tokenHeader !== ADMIN_TOKEN && tokenQuery !== ADMIN_TOKEN)) {
      return json(401, { error: 'Unauthorized' });
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { error: 'Invalid JSON body' }); }

    const { id, mode = 'soft' } = body || {};
    if (!id) return json(400, { error: 'Missing id' });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return json(400, { error: 'Invalid id format (UUID expected)' });

    const sql = neon(connectionString);

    let res;
    if (mode === 'hard') {
      // suppression PII basique + marquage supprimé
      res = await sql/*sql*/`
        UPDATE public.candidats
           SET nom = NULL,
               email = NULL,
               ville = NULL,
               domaine = NULL,
               competences = NULL,
               bio = NULL,
               file_key = NULL,
               file_url = NULL,
               deleted_at = NOW()
         WHERE id = ${id}
         RETURNING id
      `;
    } else {
      // soft delete: marque uniquement deleted_at (les listings filtrent dessus)
      res = await sql/*sql*/`
        UPDATE public.candidats
           SET deleted_at = NOW()
         WHERE id = ${id}
         RETURNING id
      `;
    }

    if (res.length === 0) return json(404, { error: 'Not found' });

    try {
      await sql/*sql*/`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('admin_erasure','info','candidate_erased', jsonb_build_object('id', ${id}, 'mode', ${mode}))
      `;
    } catch (_) {}

    return json(200, { ok: true, id, mode });
  } catch (err) {
    console.error('admin-erasure error:', err);
    return json(500, { error: 'Server error' });
  }
};
