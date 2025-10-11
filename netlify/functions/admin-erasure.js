// netlify/functions/admin-erasure.js
// Efface (logiquement) un candidat par email ou id (POST { email } ou { id })

const { neon } = require('@netlify/neon');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const tokenHeader = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    const tokenQuery  = (event.queryStringParameters && event.queryStringParameters.token) || null;
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (!ADMIN_TOKEN || (tokenHeader !== ADMIN_TOKEN && tokenQuery !== ADMIN_TOKEN)) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    const body = JSON.parse(event.body || '{}');
    const email = body.email;
    const id = body.id;

    if (!email && !id) {
      return { statusCode: 400, body: 'Missing email or id' };
    }

    const sql = neon();

    // effacement logique: on met deleted_at, on retire approved, on nettoie PII minimales
    const res = await sql/*sql*/`
      UPDATE public.candidats
      SET deleted_at = now(),
          approved = false,
          nom = null,
          email = null,
          ville = null,
          bio = null,
          competences = null,
          domaine = null
      WHERE ${email ? sql`email = ${email}` : sql`id = ${id}`}
      RETURNING id;
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: true, count: res.length })
    };
  } catch (err) {
    console.error('admin-erasure error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
