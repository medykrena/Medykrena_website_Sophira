// netlify/functions/forms-webhook.js
// Netlify Forms (Outgoing webhook) -> Insertion dans Neon (PostgreSQL)
// Dépendance: @neondatabase/serverless (flavor Netlify) et variable NETLIFY_DATABASE_URL
// Optionnel: WEBHOOK_TOKEN (sécurité légère par header/query)

'use strict';

const { neon } = require('@neondatabase/serverless');

function responseJSON(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return responseJSON(405, { error: 'Method Not Allowed' });
    }

    // ---------------------------------------------------------
    // 1) Sécurité légère par token (header X-Webhook-Token ou ?token=)
    // ---------------------------------------------------------
    const EXPECTED = process.env.WEBHOOK_TOKEN || '';
    const hdrs = event.headers || {};
    const providedHeader = hdrs['x-webhook-token'] || hdrs['X-Webhook-Token'];
    const providedQuery  = (event.queryStringParameters && event.queryStringParameters.token) || null;
    const provided = providedHeader || providedQuery || '';

    if (EXPECTED && provided !== EXPECTED) {
      return responseJSON(401, { error: 'Unauthorized' });
    }

    // ---------------------------------------------------------
    // 2) Récupération payload Netlify (Outgoing webhook)
    //    Netlify envoie généralement { payload: {...} }
    // ---------------------------------------------------------
    let raw;
    try {
      raw = JSON.parse(event.body || '{}');
    } catch {
      return responseJSON(400, { error: 'Invalid JSON body' });
    }

    const submission = raw && (raw.payload || raw) || {};
    const data = submission.data || submission; // compat
    const formName = submission.form_name || data.form_name || '';
    const netlifyId = submission.id || submission.uuid || null;

    // ---------------------------------------------------------
    // 3) Fichiers (URL) si présents
    // ---------------------------------------------------------
    let fileUrl = null;
    let fileKey = null;

    // a) champ fichier "cv" renvoyé en URL
    if (typeof data.cv === 'string' && data.cv.trim()) {
      fileUrl = data.cv.trim();
      fileKey = 'cv';
    }

    // b) payload.files[] via webhook Netlify
    const files = Array.isArray(submission.files) ? submission.files : [];
    if (!fileUrl && files.length) {
      const first = files.find(f => f && (f.url || f.path));
      if (first) {
        fileUrl = first.url || first.path || null;
        fileKey = first.name || 'file';
      }
    }

    // ---------------------------------------------------------
    // 4) Connexion DB (Neon)
    // ---------------------------------------------------------
    const sql = neon(); // lit NETLIFY_DATABASE_URL

    // ---------------------------------------------------------
    // 5) Routage selon le nom du formulaire
    // ---------------------------------------------------------
    if (formName === 'sophira-candidat') {
      const nom         = data.nom || null;
      const email       = data.email || null;
      const ville       = data.ville || null;
      const domaine     = data.domaine || null;
      const competences = data.competences || null;
      const bio         = data.bio || null;

      await sql/*sql*/`
        INSERT INTO public.candidats
          (nom, email, ville, domaine, competences, bio, netlify_id, netlify_form, file_key, file_url, raw_payload)
        VALUES
          (${nom}, ${email}, ${ville}, ${domaine}, ${competences}, ${bio}, ${netlifyId}, ${formName}, ${fileKey}, ${fileUrl}, ${sql.json(submission)})
      `;

      if (fileUrl) {
        await sql/*sql*/`
          INSERT INTO public.uploads (netlify_id, form_name, field_name, file_url)
          VALUES (${netlifyId}, ${formName}, ${fileKey}, ${fileUrl})
        `;
      }

      await sql/*sql*/`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('netlify_forms_webhook','info','candidat_inserted', ${sql.json({ netlifyId, email, fileKey, fileUrl })})
      `;

      return responseJSON(200, { ok: true, type: 'candidat', netlifyId });
    }

    if (formName === 'sophira-employeur') {
      const societe = data.societe || null;
      const contact = data.contact || null;
      const email   = data.email   || null;
      const ville   = data.ville   || null;
      const besoins = data.besoins || null;
      const message = data.message || null;

      await sql/*sql*/`
        INSERT INTO public.employeurs
          (societe, contact, email, ville, besoins, message, netlify_id, netlify_form, raw_payload)
        VALUES
          (${societe}, ${contact}, ${email}, ${ville}, ${besoins}, ${message}, ${netlifyId}, ${formName}, ${sql.json(submission)})
      `;

      await sql/*sql*/`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('netlify_forms_webhook','info','employeur_inserted', ${sql.json({ netlifyId, email })})
      `;

      return responseJSON(200, { ok: true, type: 'employeur', netlifyId });
    }

    // ---------------------------------------------------------
    // 6) Formulaire non ciblé -> on journalise en "warn" mais 200
    // ---------------------------------------------------------
    await sql/*sql*/`
      INSERT INTO public.audit_logs (source, level, message, context)
      VALUES ('netlify_forms_webhook','warn','unknown_form', ${sql.json({ formName, keys: Object.keys(data || {}) })})
    `;

    return responseJSON(200, { ok: true, ignored: true, formName });
  } catch (err) {
    // Tentative de log serveur
    try {
      const sql = neon();
      await sql/*sql*/`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('netlify_forms_webhook','error','handler_failed', ${sql.json({ error: String(err) })})
      `;
    } catch (_) {}
    return responseJSON(500, { error: 'Internal Server Error' });
  }
};
