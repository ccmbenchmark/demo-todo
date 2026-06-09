# Couleur par projet — design

**Date :** 2026-06-09
**Application :** demo-todo (Node.js / Express + MySQL, déployée sur Railway)

## Objectif

Permettre de donner une **couleur** à chaque projet pour mieux les distinguer
visuellement. Repérage visuel uniquement — pas de tri ni de filtre par couleur.

## Choix produit

- Palette **prédéfinie de 8 couleurs** (pas de couleur libre).
- Couleur par défaut : bleu (`#4f46e5`, la couleur d'accent actuelle de l'appli).
- La couleur se voit :
  - dans la liste des projets (pastille devant le nom) ;
  - en tête du projet ouvert (pastille à côté du titre).
- On peut choisir la couleur à la création **et** la changer ensuite.

## Palette autorisée

| Clé        | Hex       |
|------------|-----------|
| bleu       | `#4f46e5` |
| vert       | `#16a34a` |
| orange     | `#ea580c` |
| rouge      | `#dc2626` |
| violet     | `#7c3aed` |
| rose       | `#db2777` |
| turquoise  | `#0891b2` |
| gris       | `#6b7280` |

La liste est la **source de vérité** côté serveur : toute couleur hors palette est
refusée (validation de sécurité, évite d'injecter une valeur arbitraire).

## Changements techniques

### Base de données (`server.js` → `initDb`)
- Ajouter une colonne `color VARCHAR(7) NOT NULL DEFAULT '#4f46e5'` à la table
  `projects` si elle n'existe pas (même mécanisme que l'ajout de `tasks.project_id`).
- Les projets existants prennent le bleu par défaut — aucune perte de données.

### API (`server.js`)
- `POST /api/projects` : accepte un champ optionnel `color`. Valide qu'il appartient
  à la palette ; sinon → couleur par défaut. Renvoie la couleur dans la réponse.
- `PATCH /api/projects/:id` : accepte `name` et/ou `color`. Met à jour uniquement les
  champs fournis. Valide la couleur de la même façon.
- `GET /api/projects` : renvoie déjà toutes les colonnes (`SELECT *`), donc `color`
  sera inclus automatiquement.

### Interface (`public/index.html`)
- Pastille de couleur devant chaque projet dans la liste de gauche.
- Sous le formulaire de création de projet : rangée de pastilles cliquables pour
  choisir la couleur du nouveau projet (bleu pré-sélectionné).
- Clic sur la pastille d'un projet existant → petit sélecteur de couleurs qui met à
  jour la couleur via `PATCH`.
- Pastille de couleur à côté du titre du projet ouvert.

## Hors périmètre (YAGNI)

- Couleurs personnalisées libres.
- Tri / filtrage des projets par couleur.
- Couleurs sur les tâches ou les notes.
