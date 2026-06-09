# demo-todo — Gestionnaire de tâches et notes par projet

Petite application web (Node.js / Express) avec base de données MySQL, déployée sur Railway.
Les tâches sont organisées par **projets** ; chaque projet a ses tâches (ajouter, lister, cocher,
supprimer) et ses **notes** écrites. Tout est enregistré en base.

## Architecture en production
<!-- ZONE GÉRÉE AUTOMATIQUEMENT PAR LES AGENTS RAILWAY — NE PAS ÉDITER À LA MAIN -->
- **Compte Railway** : `tech.core@ccmbenchmark.com` — workspace « CCM BENCHMARK »
- **Projet** : `demo-todo` — id `8c365b5d-78d9-4406-a952-6f19ae846c70` — environnement `production`
- **Services en ligne** :
  - `demo-todo-app` — application web Node.js/Express
    - URL publique : https://demo-todo-app-production-5768.up.railway.app
  - `MySQL-MuO9` — base de données MySQL, branchée à l'appli via la variable `DATABASE_URL`
    - Tables connues : `projects` (avec colonne `color`, VARCHAR(7), défaut `#4f46e5`),
      `tasks` (avec colonne `project_id`), `notes`
    - Migration auto au démarrage (`server.js` → `initDb`) : création des tables manquantes,
      ajout de `tasks.project_id` si absent, rattachement des tâches existantes au projet « Général »,
      ajout de `projects.color` si absent (fonctionnalité « couleur par projet »)
- **Notes de déploiement** :
  - Le `package-lock.json` doit pointer vers le registre public `https://registry.npmjs.org/`
    (un `.npmrc` projet force ce registre). Un lockfile généré contre le registre privé CCM
    (`npm.ccmbg.com`) fait échouer le build Railway sur `npm ci` (erreur d'authentification E401).
  - `.railwayignore` exclut `node_modules` de l'upload.
- **Nettoyage (2026-06-09)** : aucun service ni base en double. Les déploiements échoués des
  2 tentatives initiales (registre npm privé) restent en historique, non supprimables et sans
  impact. Volume orphelin `mysql-volume` (id `b5be0bb3-6a77-4312-853f-d218cca2a5fb`, 0 Mo,
  rattaché à aucun service) **supprimé sur autorisation utilisateur** (suppression programmée par
  Railway au 2026-06-11). Le volume actif `mysql-volume-a3LN` (MySQL-MuO9, ~1179 Mo) est intact.
  Données de test (projet « Test », tâches « Test ») retirées de la base via l'API de l'appli.
- **Déploiement (2026-06-09)** : mise à jour « couleur par projet » déployée sur `demo-todo-app`
  (nouvelle colonne `projects.color`, routes POST/PATCH `/api/projects`, pastilles de couleur dans
  `public/index.html`). Build Railpack/npm ci OK, service `Online`, migration auto appliquée
  (l'API `/api/projects` renvoie bien le champ `color`). Aucun autre projet/service touché.
- **Vérification nettoyage post-déploiement (2026-06-09)** : périmètre confirmé (projet
  `8c365b5d-78d9-4406-a952-6f19ae846c70`, workspace « CCM BENCHMARK », compte
  `tech.core@ccmbenchmark.com`). Exactement 2 services, tous deux `Online`, aucun doublon ni
  orphelin. Le volume orphelin `mysql-volume` (0 Mo) reste en suppression programmée par Railway
  (2026-06-11). Le volume actif `mysql-volume-a3LN` (~1179 Mo) est intact. Aucune suppression
  nécessaire (rien de « sans risque » à retirer).
- **Dernière mise à jour** : 2026-06-09
<!-- FIN ZONE GÉRÉE -->
