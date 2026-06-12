import express from "express";
import pg from "pg";

const app = express();
app.use(express.json());
app.use(express.static("public"));

// --- Palette de couleurs autorisées pour les projets ---------------------
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
function sanitizeColor(value) {
  return PROJECT_COLORS.includes(value) ? value : DEFAULT_COLOR;
}

// Une échéance valide est une date RÉELLE au format AAAA-MM-JJ.
function isValidDueDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1000) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// --- Connexion à la base PostgreSQL (Render) ------------------------------
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Aucune URL de base de données trouvée (DATABASE_URL).");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

// Crée/complète les tables si besoin. Réessais car la base peut tarder au démarrage.
async function initDb(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          color VARCHAR(7) NOT NULL DEFAULT '${DEFAULT_COLOR}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          done BOOLEAN NOT NULL DEFAULT FALSE,
          project_id INTEGER,
          due_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notes (
          id SERIAL PRIMARY KEY,
          project_id INTEGER NOT NULL,
          title VARCHAR(255) NOT NULL,
          body TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Migrations idempotentes (Postgres supporte ADD COLUMN IF NOT EXISTS).
      await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '" + DEFAULT_COLOR + "'");
      await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER");
      await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE");

      const { rows } = await pool.query("SELECT id FROM projects ORDER BY id ASC LIMIT 1");
      if (rows.length === 0) {
        await pool.query("INSERT INTO projects (name) VALUES ($1)", ["Général"]);
      }
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
app.get("/api/projects", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM projects ORDER BY created_at ASC");
  res.json(rows);
});

app.post("/api/projects", async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Le nom du projet est vide." });
  const color = sanitizeColor(req.body.color);
  const { rows } = await pool.query(
    "INSERT INTO projects (name, color) VALUES ($1, $2) RETURNING id",
    [name, color]
  );
  res.status(201).json({ id: rows[0].id, name, color });
});

app.patch("/api/projects/:id", async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  if (req.body.name !== undefined) {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Le nom du projet est vide." });
    fields.push(`name = $${i++}`); values.push(name);
  }
  if (req.body.color !== undefined) {
    fields.push(`color = $${i++}`); values.push(sanitizeColor(req.body.color));
  }
  if (fields.length === 0) return res.status(400).json({ error: "Rien à mettre à jour." });
  values.push(req.params.id);
  await pool.query(`UPDATE projects SET ${fields.join(", ")} WHERE id = $${i}`, values);
  res.json({ ok: true });
});

app.delete("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM tasks WHERE project_id = $1", [id]);
  await pool.query("DELETE FROM notes WHERE project_id = $1", [id]);
  await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  res.json({ ok: true });
});

// --- Routes : TÂCHES ------------------------------------------------------
app.get("/api/tasks", async (req, res) => {
  const projectId = req.query.project_id;
  if (!projectId) return res.json([]);
  const { rows } = await pool.query(
    `SELECT id, title, done, project_id, created_at,
            to_char(due_date, 'YYYY-MM-DD') AS due_date
     FROM tasks WHERE project_id = $1
     ORDER BY (due_date IS NULL), due_date ASC, created_at DESC`,
    [projectId]
  );
  res.json(rows);
});

app.post("/api/tasks", async (req, res) => {
  const title = (req.body.title || "").trim();
  const projectId = req.body.project_id;
  if (!title) return res.status(400).json({ error: "Le titre est vide." });
  if (!projectId) return res.status(400).json({ error: "Aucun projet sélectionné." });
  let dueDate = null;
  if (req.body.due_date) {
    if (!isValidDueDate(req.body.due_date)) return res.status(400).json({ error: "La date limite est invalide." });
    dueDate = req.body.due_date;
  }
  const { rows } = await pool.query(
    "INSERT INTO tasks (title, project_id, due_date) VALUES ($1, $2, $3) RETURNING id",
    [title, projectId, dueDate]
  );
  res.status(201).json({ id: rows[0].id, title, done: false, project_id: projectId, due_date: dueDate });
});

app.patch("/api/tasks/:id", async (req, res) => {
  if (req.body && req.body.due_date !== undefined) {
    const raw = req.body.due_date;
    let dueDate = null;
    if (raw !== null && raw !== "") {
      if (!isValidDueDate(raw)) return res.status(400).json({ error: "La date limite est invalide." });
      dueDate = raw;
    }
    await pool.query("UPDATE tasks SET due_date = $1 WHERE id = $2", [dueDate, req.params.id]);
    return res.json({ ok: true });
  }
  await pool.query("UPDATE tasks SET done = NOT done WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/tasks/:id", async (req, res) => {
  await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// --- Routes : NOTES -------------------------------------------------------
app.get("/api/notes", async (req, res) => {
  const projectId = req.query.project_id;
  if (!projectId) return res.json([]);
  const { rows } = await pool.query(
    "SELECT * FROM notes WHERE project_id = $1 ORDER BY updated_at DESC",
    [projectId]
  );
  res.json(rows);
});

app.post("/api/notes", async (req, res) => {
  const title = (req.body.title || "").trim();
  const body = (req.body.body || "").toString();
  const projectId = req.body.project_id;
  if (!title) return res.status(400).json({ error: "Le titre de la note est vide." });
  if (!projectId) return res.status(400).json({ error: "Aucun projet sélectionné." });
  const { rows } = await pool.query(
    "INSERT INTO notes (project_id, title, body) VALUES ($1, $2, $3) RETURNING id",
    [projectId, title, body]
  );
  res.status(201).json({ id: rows[0].id, project_id: projectId, title, body });
});

app.patch("/api/notes/:id", async (req, res) => {
  const title = (req.body.title || "").trim();
  const body = (req.body.body || "").toString();
  if (!title) return res.status(400).json({ error: "Le titre de la note est vide." });
  await pool.query(
    "UPDATE notes SET title = $1, body = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
    [title, body, req.params.id]
  );
  res.json({ ok: true });
});

app.delete("/api/notes/:id", async (req, res) => {
  await pool.query("DELETE FROM notes WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// --- Diagnostic -----------------------------------------------------------
app.get("/__dbcheck", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT 1 AS ok");
    res.json({ db: "ok", result: rows });
  } catch (e) {
    res.status(500).json({ db: "error", code: e.code, message: e.message });
  }
});

// --- Démarrage ------------------------------------------------------------
const port = process.env.PORT || 3000;
try {
  const u = new URL(dbUrl);
  console.log(`Connexion base visée : ${u.hostname}:${u.port || 5432} (db ${u.pathname.slice(1)})`);
} catch {}
app.listen(port, () => console.log(`Appli en ligne sur le port ${port}`));
initDb(60).catch((err) => console.error("initDb a échoué :", err.message));
