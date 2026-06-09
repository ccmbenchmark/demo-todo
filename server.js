import express from "express";
import mysql from "mysql2/promise";

const app = express();
app.use(express.json());
app.use(express.static("public"));

// --- Palette de couleurs autorisées pour les projets ---------------------
// Source de vérité côté serveur : toute couleur hors de cette liste est
// refusée (on retombe alors sur la couleur par défaut).
const PROJECT_COLORS = [
  "#4f46e5", // bleu (défaut)
  "#16a34a", // vert
  "#ea580c", // orange
  "#dc2626", // rouge
  "#7c3aed", // violet
  "#db2777", // rose
  "#0891b2", // turquoise
  "#6b7280", // gris
];
const DEFAULT_COLOR = PROJECT_COLORS[0];

// Renvoie la couleur si elle fait partie de la palette, sinon la couleur par défaut.
function sanitizeColor(value) {
  return PROJECT_COLORS.includes(value) ? value : DEFAULT_COLOR;
}

// --- Connexion à la base MySQL -------------------------------------------
// Railway fournit l'URL de connexion via une variable d'environnement.
// On accepte plusieurs noms possibles pour plus de souplesse.
const dbUrl =
  process.env.DATABASE_URL ||
  process.env.MYSQL_URL ||
  process.env.MYSQL_PUBLIC_URL;

if (!dbUrl) {
  console.error("Aucune URL de base de données trouvée (DATABASE_URL / MYSQL_URL).");
  process.exit(1);
}

const pool = mysql.createPool(dbUrl);

// Crée/complète les tables si besoin. On réessaie quelques fois car la base
// peut mettre quelques secondes à être prête au démarrage.
async function initDb(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 1) Table des projets
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2) Table des tâches (créée si absente)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          done BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3) S'assurer qu'il existe au moins un projet "Général"
      //    (pour y ranger les tâches existantes).
      const [projRows] = await pool.query("SELECT id FROM projects ORDER BY id ASC LIMIT 1");
      let defaultProjectId;
      if (projRows.length === 0) {
        const [r] = await pool.query("INSERT INTO projects (name) VALUES (?)", ["Général"]);
        defaultProjectId = r.insertId;
      } else {
        defaultProjectId = projRows[0].id;
      }

      // 4) Ajouter la colonne project_id aux tâches si elle n'existe pas encore.
      const [cols] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_id'`
      );
      if (cols.length === 0) {
        await pool.query("ALTER TABLE tasks ADD COLUMN project_id INT NULL");
        // Ranger toutes les tâches existantes dans le projet "Général".
        await pool.query("UPDATE tasks SET project_id = ? WHERE project_id IS NULL", [defaultProjectId]);
      }

      // 4 bis) Ajouter la colonne "color" aux projets si elle n'existe pas encore.
      //        Les projets existants prennent la couleur par défaut (bleu).
      const [colorCols] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'color'`
      );
      if (colorCols.length === 0) {
        await pool.query(
          "ALTER TABLE projects ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT ?",
          [DEFAULT_COLOR]
        );
      }

      // 5) Table des notes (documents écrits) rattachées à un projet.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          project_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          body MEDIUMTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      console.log("Base prête : tables 'projects', 'tasks', 'notes' OK.");
      return;
    } catch (err) {
      console.log(`Base pas encore prête (essai ${attempt}/${retries}) : ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Impossible de se connecter à la base après plusieurs essais.");
}

// --- Routes : PROJETS -----------------------------------------------------

// Lister les projets
app.get("/api/projects", async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM projects ORDER BY created_at ASC");
  res.json(rows);
});

// Créer un projet
app.post("/api/projects", async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Le nom du projet est vide." });
  const color = sanitizeColor(req.body.color);
  const [result] = await pool.query(
    "INSERT INTO projects (name, color) VALUES (?, ?)",
    [name, color]
  );
  res.status(201).json({ id: result.insertId, name, color });
});

// Renommer un projet et/ou changer sa couleur
app.patch("/api/projects/:id", async (req, res) => {
  const fields = [];
  const values = [];

  if (req.body.name !== undefined) {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Le nom du projet est vide." });
    fields.push("name = ?");
    values.push(name);
  }
  if (req.body.color !== undefined) {
    fields.push("color = ?");
    values.push(sanitizeColor(req.body.color));
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "Rien à mettre à jour." });
  }

  values.push(req.params.id);
  await pool.query(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`, values);
  res.json({ ok: true });
});

// Supprimer un projet (et ses tâches + notes)
app.delete("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM tasks WHERE project_id = ?", [id]);
  await pool.query("DELETE FROM notes WHERE project_id = ?", [id]);
  await pool.query("DELETE FROM projects WHERE id = ?", [id]);
  res.json({ ok: true });
});

// --- Routes : TÂCHES ------------------------------------------------------

// Lister les tâches d'un projet
app.get("/api/tasks", async (req, res) => {
  const projectId = req.query.project_id;
  if (!projectId) return res.json([]);
  const [rows] = await pool.query(
    "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC",
    [projectId]
  );
  res.json(rows);
});

// Ajouter une tâche dans un projet
app.post("/api/tasks", async (req, res) => {
  const title = (req.body.title || "").trim();
  const projectId = req.body.project_id;
  if (!title) return res.status(400).json({ error: "Le titre est vide." });
  if (!projectId) return res.status(400).json({ error: "Aucun projet sélectionné." });
  const [result] = await pool.query(
    "INSERT INTO tasks (title, project_id) VALUES (?, ?)",
    [title, projectId]
  );
  res.status(201).json({ id: result.insertId, title, done: false, project_id: projectId });
});

// Cocher / décocher une tâche
app.patch("/api/tasks/:id", async (req, res) => {
  await pool.query("UPDATE tasks SET done = NOT done WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Supprimer une tâche
app.delete("/api/tasks/:id", async (req, res) => {
  await pool.query("DELETE FROM tasks WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- Routes : NOTES -------------------------------------------------------

// Lister les notes d'un projet
app.get("/api/notes", async (req, res) => {
  const projectId = req.query.project_id;
  if (!projectId) return res.json([]);
  const [rows] = await pool.query(
    "SELECT * FROM notes WHERE project_id = ? ORDER BY updated_at DESC",
    [projectId]
  );
  res.json(rows);
});

// Créer une note dans un projet
app.post("/api/notes", async (req, res) => {
  const title = (req.body.title || "").trim();
  const body = (req.body.body || "").toString();
  const projectId = req.body.project_id;
  if (!title) return res.status(400).json({ error: "Le titre de la note est vide." });
  if (!projectId) return res.status(400).json({ error: "Aucun projet sélectionné." });
  const [result] = await pool.query(
    "INSERT INTO notes (project_id, title, body) VALUES (?, ?, ?)",
    [projectId, title, body]
  );
  res.status(201).json({ id: result.insertId, project_id: projectId, title, body });
});

// Modifier une note
app.patch("/api/notes/:id", async (req, res) => {
  const title = (req.body.title || "").trim();
  const body = (req.body.body || "").toString();
  if (!title) return res.status(400).json({ error: "Le titre de la note est vide." });
  await pool.query("UPDATE notes SET title = ?, body = ? WHERE id = ?", [title, body, req.params.id]);
  res.json({ ok: true });
});

// Supprimer une note
app.delete("/api/notes/:id", async (req, res) => {
  await pool.query("DELETE FROM notes WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- Diagnostic (temporaire) ---------------------------------------------
app.get("/__dbcheck", async (req, res) => {
  try {
    const [r] = await pool.query("SELECT 1 AS ok");
    res.json({ db: "ok", result: r });
  } catch (e) {
    res.status(500).json({ db: "error", code: e.code, errno: e.errno, message: e.message });
  }
});

// --- Démarrage ------------------------------------------------------------
const port = process.env.PORT || 3000;

// Indique en clair vers quel hôte de base on se connecte (sans le mot de passe).
try {
  const u = new URL(dbUrl);
  console.log(`Connexion base visée : ${u.hostname}:${u.port || 3306} (db ${u.pathname.slice(1)})`);
} catch {}

// On démarre le serveur web IMMÉDIATEMENT : le conteneur reste en ligne même si la
// base met du temps à être prête (important sur les PaaS type Dokploy/Coolify).
app.listen(port, () => console.log(`Appli en ligne sur le port ${port}`));

// Connexion à la base en arrière-plan, avec de larges réessais (~2 min). On ne quitte
// JAMAIS le process : si la base tarde, les routes répondront en erreur le temps qu'elle
// soit prête, mais le conteneur ne plante pas.
initDb(60).catch((err) =>
  console.error("initDb a échoué après plusieurs essais :", err.message)
);
