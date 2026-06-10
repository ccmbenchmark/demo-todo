# Échéances sur les tâches — conception

Date : 2026-06-10
Application : demo-todo (Node.js/Express + MySQL)

## Objectif

Permettre de donner une **date limite** (échéance) optionnelle à chaque tâche,
de la visualiser d'un coup d'œil (en retard / aujourd'hui / à venir) et de la
modifier ou l'enlever facilement.

## Base de données

- Nouvelle colonne `tasks.due_date` de type `DATE`, nullable (pas de date = pas d'échéance).
- Migration automatique au démarrage dans `initDb()` (même mécanisme que `projects.color`) :
  si la colonne n'existe pas, `ALTER TABLE tasks ADD COLUMN due_date DATE NULL`.
- Aucune donnée existante n'est modifiée : les tâches actuelles restent sans échéance.

## API

- `GET /api/tasks?project_id=X`
  - Renvoie en plus le champ `due_date` au format `AAAA-MM-JJ` (ou `null`).
  - Le SELECT utilise `DATE_FORMAT(due_date, '%Y-%m-%d')` pour éviter tout décalage
    de fuseau horaire à la sérialisation.
  - Tri : les tâches avec échéance d'abord (par date croissante), puis les autres
    par date de création décroissante (ordre actuel).
- `POST /api/tasks`
  - Accepte un champ optionnel `due_date`. S'il est fourni et non vide, il doit
    respecter le format `AAAA-MM-JJ` (regex), sinon erreur 400.
- `PATCH /api/tasks/:id`
  - **Compatibilité conservée** : un corps vide (ou sans `due_date`) bascule
    l'état fait/à faire, comme aujourd'hui.
  - Si le corps contient `due_date` : met à jour uniquement l'échéance
    (`null` ou `""` pour l'effacer ; sinon format `AAAA-MM-JJ` exigé, erreur 400 sinon).

## Interface

- Formulaire d'ajout de tâche : un champ date optionnel (`<input type="date">`)
  à côté du champ titre.
- Sur chaque tâche :
  - Si elle a une échéance : badge « 📅 12 juin » —
    **rouge** si la date est passée et la tâche non faite,
    **orange** si c'est aujourd'hui et la tâche non faite,
    **gris** sinon (à venir ou tâche faite).
  - Un clic sur le badge (ou sur un petit bouton 📅 discret si pas de date)
    ouvre un champ date en ligne avec « OK » et « Effacer ».
- La comparaison « en retard / aujourd'hui » se fait côté navigateur avec la
  date locale du jour au format `AAAA-MM-JJ` (comparaison de chaînes, fiable
  pour ce format).

## Hors périmètre (volontairement)

- Pas de rappels ni de notifications.
- Pas d'heure, seulement une date.
- Pas d'échéance sur les notes ni sur les projets.

## Déploiement

- Railway : service `demo-todo-app` (projet `8c365b5d-…`), migration auto au démarrage.
- Dokploy : projet `demo-todo`, application `demo-todo-app` (MariaDB), même migration auto.
