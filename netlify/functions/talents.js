// netlify/functions/talents.js
// Liste anonymisée des candidats Sophira (uniquement approuvés)

const { neon, neonConfig } = require('@neondatabase/serverless');
neonConfig.fetchConnectionCache = true;
const connectionString = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

exports.handler = async () => {
  try {
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
      ORDER BY submitted_at DESC
      LIMIT 50;
    `;

    const result = rows.map(r => ({
      id: r.id,
      domaine: r.domaine,
      competences: r.competences
        ? r.competences.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      bio: r.bio ? (r.bio.length > 180 ? r.bio.slice(0, 180) + '…' : r.bio) : '',
      ville: r.ville || '',
      date: r.submitted_at
        ? new Date(r.submitted_at).toLocaleDateString('fr-CH')
        : ''
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result, null, 2)
    };
  } catch (err) {
    console.error('Erreur talents.js:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
