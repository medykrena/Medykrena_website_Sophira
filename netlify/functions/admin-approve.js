// netlify/functions/admin-approve.js
// Approve/Désapprouve un candidat (POST JSON: { id: <uuid>, approved: true|false })
// Protection simple via X-Admin-Token

const { neon } = require('@netlify/neon');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Vérif du token admin
    const tokenHeader = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    const tokenQuery  = (event.queryStringParameters && event.queryStringParameters.token) || null;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    if (!ADMIN_TOKEN || (tokenHeader !== ADMIN_TOKEN && tokenQuery !== ADMIN_TOKEN)) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    // Parse du body
    const body = JSON.parse(event.body || '{}');
    const id = body.id;
    const approved = typeof body.approved === 'boolean' ? body.approved : true;

    if (!id) {
      return { statusCode: 400, body: 'Missing id' };
    }

    const sql = neon();
    const res = await sql/*sql*/`
      UPDATE public.candidats
      SET approved = ${approved}
      WHERE id = ${id}
      RETURNING id, approved;
    `;

    if (res.length === 0) {
      return { statusCode: 404, body: 'Not found' };
    }

    // (optionnel) journaliser
    await sql/*sql*/`
      INSERT INTO public.audit_logs(level, message, context)
      VALUES ('info', 'candidate_approval_changed', jsonb_build_object('id', ${id}, 'approved', ${approved}))
    `;

    // (optionnel) email interne après approbation — on ajoutera juste après avec SendGrid

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: true, id, approved })
    };
  } catch (err) {
    console.error('admin-approve error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
