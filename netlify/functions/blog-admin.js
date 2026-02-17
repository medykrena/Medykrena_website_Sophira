// netlify/functions/blog-admin.js
// API protégée — créer, modifier, supprimer des articles du blog
// Protégée par mot de passe via variable BLOG_ADMIN_PASSWORD
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
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  },
  body: JSON.stringify(data, null, 2),
});

exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
    if (event.httpMethod !== 'POST')    return json(405, { error: 'Method Not Allowed' });

    // ── Vérification du mot de passe ──────────────────────────────────────
    const authHeader = event.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const adminPassword = process.env.BLOG_ADMIN_PASSWORD || '';

    if (!adminPassword) {
      return json(500, { error: 'Variable BLOG_ADMIN_PASSWORD non configurée.' });
    }
    if (!token || token !== adminPassword) {
      return json(401, { error: 'Accès refusé.' });
    }

    // ── Connexion Neon ─────────────────────────────────────────────────────
    if (!connectionString) {
      return json(500, { error: 'Missing NETLIFY_DATABASE_URL (or DATABASE_URL)' });
    }
    const sql = neon(connectionString);

    // ── Action demandée ────────────────────────────────────────────────────
    const qp = event.queryStringParameters || {};
    const action = qp.action || '';
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch(e) {}

    // ── INITIALISATION : créer la table (une seule fois) ──────────────────
    if (action === 'init') {
      await sql`
        CREATE TABLE IF NOT EXISTS public.articles (
          id               SERIAL PRIMARY KEY,
          titre            TEXT        NOT NULL,
          contenu          TEXT        NOT NULL,
          langue           VARCHAR(2)  NOT NULL DEFAULT 'fr',
          resume           TEXT,
          date_publication DATE        NOT NULL DEFAULT CURRENT_DATE,
          publie           BOOLEAN     NOT NULL DEFAULT true,
          cree_le          TIMESTAMP   NOT NULL DEFAULT NOW(),
          modifie_le       TIMESTAMP   NOT NULL DEFAULT NOW()
        )
      `;
      return json(200, { message: "✅ Table 'articles' créée avec succès." });
    }

    // ── CRÉER un article ───────────────────────────────────────────────────
    if (action === 'creer') {
      const { titre, contenu, langue = 'fr', resume = '', date_publication, publie = true } = body;
      if (!titre || !contenu) {
        return json(400, { error: 'Le titre et le contenu sont obligatoires.' });
      }
      const date = date_publication || new Date().toISOString().split('T')[0];

      const rows = await sql`
        INSERT INTO public.articles (titre, contenu, langue, resume, date_publication, publie)
        VALUES (${titre}, ${contenu}, ${langue}, ${resume}, ${date}, ${publie})
        RETURNING id, titre, langue, date_publication
      `;
      return json(201, { message: '✅ Article publié avec succès !', article: rows[0] });
    }

    // ── MODIFIER un article ────────────────────────────────────────────────
    if (action === 'modifier') {
      const { id, titre, contenu, langue, resume, date_publication, publie } = body;
      if (!id) return json(400, { error: "L'identifiant (id) est requis." });

      const rows = await sql`
        UPDATE public.articles
        SET
          titre            = COALESCE(${titre            ?? null}, titre),
          contenu          = COALESCE(${contenu          ?? null}, contenu),
          langue           = COALESCE(${langue           ?? null}, langue),
          resume           = COALESCE(${resume           ?? null}, resume),
          date_publication = COALESCE(${date_publication ?? null}, date_publication),
          publie           = COALESCE(${publie           ?? null}, publie),
          modifie_le       = NOW()
        WHERE id = ${id}
        RETURNING id, titre, langue, modifie_le
      `;
      if (!rows.length) return json(404, { error: `Aucun article trouvé avec l'id ${id}.` });
      return json(200, { message: '✅ Article modifié avec succès.', article: rows[0] });
    }

    // ── SUPPRIMER un article ───────────────────────────────────────────────
    if (action === 'supprimer') {
      const { id } = body;
      if (!id) return json(400, { error: "L'identifiant (id) est requis." });

      await sql`DELETE FROM public.articles WHERE id = ${id}`;
      return json(200, { message: `✅ Article ${id} supprimé.` });
    }

    // ── LISTER tous les articles (y compris brouillons) ───────────────────
    if (action === 'lister') {
      const rows = await sql`
        SELECT id, titre, langue, resume, date_publication, publie, cree_le
        FROM public.articles
        ORDER BY date_publication DESC
      `;
      return json(200, rows);
    }

    return json(400, { error: `Action inconnue : "${action}". Utilisez : init, creer, modifier, supprimer, lister.` });

  } catch (err) {
    console.error('blog-admin error:', err);
    return json(500, { error: 'Server error: ' + err.message });
  }
};
