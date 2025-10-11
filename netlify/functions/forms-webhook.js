// netlify/functions/forms-webhook.js
// Handler webhook Netlify Forms -> Insertion Neon (PostgreSQL)

const { neon } = require('@netlify/neon');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Netlify envoie un JSON { payload: { ... } } pour les webhooks "Outgoing"
    const body = JSON.parse(event.body || '{}');
    const payload = body && (body.payload || body); // compat fallback

    // Sécurité légère: token secret optionnel via header (X-Webhook-Token) ou querystring ?token=
    const EXPECTED = process.env.WEBHOOK_TOKEN;
    const provided = event.headers['x-webhook-token'] || (event.queryStringParameters && event.queryStringParameters.token);
    if (EXPECTED && EXPECTED !== provided) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    // Raccourcis utiles (selon format Netlify)
    const submission = payload || {};
    const data = submission.data || submission;           // champs du formulaire
    const formName = submission.form_name || data.form_name || '';
    const netlifyId = submission.id || submission.uuid || null;

    // Récup fichiers (Netlify peut fournir files ou downloadable URLs)
    // Selon configuration, l’URL peut se trouver dans submission.files[*].url ou dans data[fileField]
    let fileUrl = null;
    let fileKey = null;

    // 1) cas champ fichier "cv" remonté comme url dans data.cv
    if (data.cv && typeof data.cv === 'string') {
      fileUrl = data.cv;
      fileKey = 'cv';
    }

    // 2) cas "files" array (selon webhook Netlify)
    const files = submission.files || [];
    if (!fileUrl && Array.isArray(files) && files.length) {
      // on tente de trouver le premier fichier
      const f = files.find(x => x && (x.url || x.path));
      if (f) {
        fileUrl = f.url || f.path;
        fileKey = f.name || 'file';
      }
    }

    // Connexion Neon
    const sql = neon(); // prend NETLIFY_DATABASE_URL automatiquement

    // Suivant le type de formulaire
    if (formName === 'sophira-candidat') {
      const nom         = data.nom || null;
      const email       = data.email || null;
      const ville       = data.ville || null;
      const domaine     = data.domaine || null;
      const competences = data.competences || null;
      const bio         = data.bio || null;

      await sql`
        INSERT INTO public.candidats (nom, email, ville, domaine, competences, bio, netlify_id, netlify_form, file_key, file_url, raw_payload)
        VALUES (${nom}, ${email}, ${ville}, ${domaine}, ${competences}, ${bio}, ${netlifyId}, ${formName}, ${fileKey}, ${fileUrl}, ${sql.json(submission)})
      `;

      if (fileUrl) {
        await sql`
          INSERT INTO public.uploads (netlify_id, form_name, field_name, file_url)
          VALUES (${netlifyId}, ${formName}, ${fileKey}, ${fileUrl})
        `;
      }

      await sql`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('netlify_forms_webhook','info','candidat inserted', ${sql.json({ netlifyId, email, fileKey, fileUrl })})
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

      await sql`
        INSERT INTO public.employeurs (societe, contact, email, ville, besoins, message, netlify_id, netlify_form, raw_payload)
        VALUES (${societe}, ${contact}, ${email}, ${ville}, ${besoins}, ${message}, ${netlifyId}, ${formName}, ${sql.json(submission)})
      `;

      await sql`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('netlify_forms_webhook','info','employeur inserted', ${sql.json({ netlifyId, email })})
      `;

      return responseJSON(200, { ok: true, type: 'employeur', netlifyId });
    }

    // Formulaires non ciblés : on journalise mais 200
    const sqlClient = neon();
    await sqlClient`
      INSERT INTO public.audit_logs (source, level, message, context)
      VALUES ('netlify_forms_webhook','warn','unknown form', ${sqlClient.json({ formName, keys: Object.keys(data || {}) })})
    `;

    return responseJSON(200, { ok: true, ignored: true, formName });
  } catch (err) {
    // log best-effort
    try {
      const sql = neon();
      await sql`
        INSERT INTO public.audit_logs (source, level, message, context)
        VALUES ('netlify_forms_webhook','error','handler failed', ${sql.json({ error: String(err) })})
      `;
    } catch(_) {}
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};

function responseJSON(code, obj){
  return {
    statusCode: code,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
  };
}
