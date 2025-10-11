// netlify/functions/talents.js
// Liste anonymisée des candidats Sophira pour la page talents.html

const { neon } = require('@netlify/neon');

exports.handler = async (event) => {
  try {
    // Connexion à la base Neon (URL lue via NETLIFY_DATABASE_URL)
    const sql = neon();

    // Lecture des 20 derniers candidats, sans infos sensibles
    const rows = await sql`
      SELECT 
        id,
        submitted_at,
        domaine,
        competences,
        bio,
        ville
      FROM public.candidats
      ORDER BY submitted_at DESC
      LIMIT 20;
    `;

    // Formatage "anonymisé"
    const result = rows.map(r => ({
      id: r.id,
      domaine: r.domaine,
      competences: r.competences ? r.competences.split(',').map(s => s.trim()) : [],
      bio: r.bio ? r.bio.substring(0, 180) + '…' : '',
      ville: r.ville || '',
      date: new Date(r.submitted_at).toLocaleDateString('fr-CH')
    }));

    // Réponse JSON
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'  // autorise lecture côté JS
      },
      body: JSON.stringify(result, null, 2)
    };
  } catch (err) {
    console.error('Erreur talents.js:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
