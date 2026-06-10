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
      `tasks` (avec colonnes `project_id` et `due_date`), `notes`
    - Migration auto au démarrage (`server.js` → `initDb`) : création des tables manquantes,
      ajout de `tasks.project_id` si absent, rattachement des tâches existantes au projet « Général »,
      ajout de `projects.color` si absent (fonctionnalité « couleur par projet »),
      ajout de `tasks.due_date` si absent (fonctionnalité « dates d'échéance »)
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
- **Déploiement (2026-06-10)** : mise à jour « dates d'échéance sur les tâches » déployée sur
  `demo-todo-app` (commits `c03bd8b` et `aa64732` : nouvelle colonne `tasks.due_date`, badges
  retard/aujourd'hui, tri par urgence, validation stricte des dates). Build Docker/npm ci OK,
  service `RUNNING`, migration auto appliquée au démarrage (logs : « Base prête »), site et API
  vérifiés en HTTP 200. Aucun autre projet/service touché, rien créé de nouveau.
- **Vérification nettoyage post-déploiement (2026-06-10)** : périmètre confirmé (projet
  `8c365b5d-78d9-4406-a952-6f19ae846c70` « demo-todo », workspace « CCM BENCHMARK », compte
  `tech.core@ccmbenchmark.com`). Exactement 2 services, tous deux en succès :
  `demo-todo-app` (id `44ce10fe-a7bf-405d-acaf-2beee419eef1`, déploiement du 2026-06-10 `SUCCESS`,
  domaine actif) et `MySQL-MuO9` (id `0b78f3b8-3796-4a92-8d23-db5c5aaab96c`, `RUNNING`).
  Aucun doublon, aucun service orphelin ou en échec. Volume actif `mysql-volume-a3LN`
  (~1180 Mo, rattaché à MySQL-MuO9) intact. Volume `mysql-volume`
  (id `b5be0bb3-6a77-4312-853f-d218cca2a5fb`) toujours en suppression programmée par Railway
  (effective le 2026-06-11) — aucune action nécessaire. Le projet « Test » (id 3) signalé par le
  health-checker est une donnée applicative en base, hors périmètre Railway : non touché.
  **Aucune suppression effectuée.**
- **Dernière mise à jour** : 2026-06-10 (vérification santé post-déploiement OK : service `Online`,
  HTTP 200, `due_date` renvoyé par `/api/tasks`, champ date présent sur la page, logs sans erreur ;
  nettoyage post-déploiement vérifié, rien à supprimer)
<!-- FIN ZONE GÉRÉE -->

## Déploiement parallèle sur Dokploy
- **Serveur Dokploy** : `http://91.209.35.239:3000` (auth via la CLI `dokploy`, config stockée par la CLI)
- **Projet** : `demo-todo` — id `eki_vIee05Jt_hcRSGCn1` — environnement `production`
- **Application** : `demo-todo-app` — id `_UDHnkxZM3fEWOynHW-Iy`
  - Source : dépôt GitHub `https://github.com/ccmbenchmark/demo-todo.git`, branche `main`,
    build par `Dockerfile`. **Le déploiement Dokploy nécessite donc un `git push` préalable**,
    puis un déclenchement manuel : `dokploy application deploy --applicationId '_UDHnkxZM3fEWOynHW-Iy'`
  - URL publique : http://demo-todo.91.209.35.239.sslip.io
  - Base de données : MariaDB du même projet Dokploy (compatible MySQL), reliée via `DATABASE_URL`
- **Astuce CLI** : `dokploy application one` renvoie une erreur 400 ; passer par
  `dokploy project all --json` ou par l'API tRPC (`/api/trpc/application.one?input=...`,
  en-tête `x-api-key`) pour lire les détails.
- **Déploiement (2026-06-10)** : fonctionnalité « dates d'échéance » mise en ligne
  (push GitHub autorisé par l'utilisateur + déclenchement CLI). Vérifié : page HTTP 200 avec champ
  date, `/__dbcheck` OK, création/lecture/suppression d'une tâche avec `due_date` via l'API OK.
