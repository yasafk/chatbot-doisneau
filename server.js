// ════════════════════════════════════════════════════════
//  SERVEUR API — Centre Social Robert Doisneau
//  SuiviDePrès — Application de suivi de projets
//
//  Démarrage : node server.js
//  Accès     : http://localhost:3001
// ════════════════════════════════════════════════════════

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = 3001;
const DATA = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // sert les fichiers HTML du même dossier

// ── Helpers ──────────────────────────────────────────────

function getData() {
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

// ── Route principale : contexte complet pour le chatbot ──
// Le bot appelle cette route à CHAQUE message pour avoir
// des données toujours à jour en temps réel.

app.get('/api/contexte', (req, res) => {
  const d = getData();

  // Construire le texte des projets
  const projetsTexte = d.projets.map(p => {
    const phases = p.phases.map(ph => {
      const icone = ph.statut === 'termine' ? '✅' : ph.statut === 'en_cours' ? '🔄' : '⏳';
      return `    ${icone} Phase ${ph.numero} : ${ph.nom}`;
    }).join('\n');

    const materielTexte = p.materiel.map(m =>
      `    - ${m.nom} : ${m.disponible}/${m.quantite} disponibles (état : ${m.etat})`
    ).join('\n');

    return `
📁 PROJET : ${p.nom}
  Statut : ${p.statut} — ${p.progression}% terminé
  Phase actuelle : ${p.phases.find(ph => ph.statut === 'en_cours')?.nom || 'N/A'}
  Budget alloué : ${p.budget.alloue}€ | Dépensé : ${p.budget.depense}€ | Restant : ${p.budget.restant}€ (${pct(p.budget.depense, p.budget.alloue)}% consommé)
  Participants : ${p.participants}
  Prochaine étape : ${p.prochaine_etape}
  Responsable : ${p.responsable} (${d.equipe.find(e => e.nom === p.responsable)?.email || 'N/A'})
  Avancement des phases :
${phases}
  Matériel :
${materielTexte}`;
  }).join('\n\n');

  // Construire le texte des actualités
  const actusTexte = d.actualites.slice(0, 8).map((a, i) =>
    `${i + 1}. [${a.date}]${a.important ? ' ⭐' : ''} ${a.titre}`
  ).join('\n');

  // Construire le texte du stock matériel
  const toutLeMateriel = d.projets.flatMap(p =>
    p.materiel.map(m => `  - ${m.nom} (${p.nom}) : ${m.disponible}/${m.quantite} dispo`)
  ).join('\n');

  // Texte complet injecté dans le bot
  const contexte = `
Tu es l'assistant IA officiel de l'application SuiviDePrès du Centre Social Robert Doisneau.
Tu réponds TOUJOURS en français, avec un ton chaleureux, clair et accessible.
Tu aides les équipes, bénévoles et coordinateurs à trouver des informations sur les projets.

Voici les données EN TEMPS RÉEL de l'application (mises à jour automatiquement) :

════════════════════════════════
📊 BUDGET GLOBAL ${d.budget_global.annee}
════════════════════════════════
Budget total    : ${d.budget_global.total}€
Engagé          : ${d.budget_global.engage}€ (${d.budget_global.depense_pct}%)
Disponible      : ${d.budget_global.disponible}€
Prochaine révision : ${d.budget_global.prochaine_revision}

════════════════════════════════
📁 PROJETS EN COURS (${d.projets.length} projets)
════════════════════════════════
${projetsTexte}

════════════════════════════════
📰 ACTUALITÉS RÉCENTES
════════════════════════════════
${actusTexte}

════════════════════════════════
🛠️ STOCK MATÉRIEL GLOBAL
════════════════════════════════
${toutLeMateriel}

════════════════════════════════
👥 ÉQUIPE
════════════════════════════════
${d.equipe.map(e => `  - ${e.nom} : ${e.role} — ${e.email}`).join('\n')}

════════════════════════════════
📞 CONTACT CENTRE
════════════════════════════════
Email     : ${d.centre.email}
Téléphone : ${d.centre.telephone}
Horaires  : ${d.centre.horaires}

════════════════════════════════
SECTIONS DE L'APPLICATION
════════════════════════════════
/dashboard  → Tableau de bord général
/projets    → Liste de tous les projets
/budget     → Graphiques et suivi budgétaire
/materiel   → Inventaire et gestion du matériel
/actualites → Fil d'actualités et annonces
/equipe     → Membres et contacts
/contact    → Formulaire et coordonnées

════════════════════════════════
RÈGLES DE RÉPONSE
════════════════════════════════
- Toujours en français, ton chaleureux et professionnel
- Réponses courtes (3-5 phrases) sauf si question complexe
- Citer les chiffres réels (budget, progression, participants)
- Orienter vers la bonne section de l'app quand utile
- Si question inconnue → rediriger vers /contact ou l'équipe concernée
- Ne jamais inventer de données non présentes dans ce contexte
`.trim();

  res.json({
    contexte,
    actualites: d.actualites,
    projets: d.projets.map(p => ({
      id: p.id,
      nom: p.nom,
      progression: p.progression,
      statut: p.statut
    }))
  });
});

// ── Route : tous les projets ──────────────────────────────
app.get('/api/projets', (req, res) => {
  res.json(getData().projets);
});

// ── Route : un projet spécifique ─────────────────────────
app.get('/api/projets/:id', (req, res) => {
  const d = getData();
  const projet = d.projets.find(p => p.id === req.params.id);
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
  res.json(projet);
});

// ── Route : mettre à jour un projet ──────────────────────
// Appelée depuis votre tableau de bord quand on modifie un projet
app.put('/api/projets/:id', (req, res) => {
  const d = getData();
  const idx = d.projets.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Projet introuvable' });
  d.projets[idx] = { ...d.projets[idx], ...req.body };
  saveData(d);
  console.log(`✏️  Projet mis à jour : ${d.projets[idx].nom}`);
  res.json({ success: true, projet: d.projets[idx] });
});

// ── Route : toutes les actualités ────────────────────────
app.get('/api/actualites', (req, res) => {
  res.json(getData().actualites);
});

// ── Route : ajouter une actualité ────────────────────────
// Appelée depuis votre tableau de bord quand on publie une actu
app.post('/api/actualites', (req, res) => {
  const d = getData();
  const nouvelleActu = {
    id: Date.now(),
    date: new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    }),
    important: false,
    ...req.body
  };
  d.actualites.unshift(nouvelleActu); // ajoute en tête de liste
  if (d.actualites.length > 30) d.actualites = d.actualites.slice(0, 30);
  saveData(d);
  console.log(`📰 Nouvelle actualité : ${nouvelleActu.titre}`);
  res.json({ success: true, actualite: nouvelleActu });
});

// ── Route : mettre à jour le budget global ───────────────
app.put('/api/budget', (req, res) => {
  const d = getData();
  d.budget_global = { ...d.budget_global, ...req.body };
  d.budget_global.depense_pct = Math.round(
    (d.budget_global.engage / d.budget_global.total) * 100
  );
  d.budget_global.disponible = d.budget_global.total - d.budget_global.engage;
  saveData(d);
  console.log('💰 Budget global mis à jour');
  res.json({ success: true, budget: d.budget_global });
});

// ── Route : santé du serveur (test) ──────────────────────
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', message: '✅ Serveur SuiviDePrès opérationnel' });
});
app.get('/api/config', (req, res) => {
  res.json({ hf_key: process.env.HF_API_KEY || "" });
});
// ── Démarrage ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   ✅  Serveur SuiviDePrès démarré        ║');
  console.log(`║   🌐  http://localhost:${PORT}              ║`);
  console.log('║   📁  data.json connecté                 ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
