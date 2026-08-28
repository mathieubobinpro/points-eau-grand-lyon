# Points d'eau — Grand Lyon

Webapp statique qui localise les fontaines et bornes fontaine d'eau potable de la
Métropole de Lyon à proximité de l'utilisateur, sur une carte OpenStreetMap avec
clustering des marqueurs.

## Stack

- HTML / CSS / JavaScript vanilla (aucun framework, aucun build).
- [Leaflet.js](https://leafletjs.com/) + tuiles [OpenStreetMap](https://www.openstreetmap.org/) pour la carte.
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) pour le regroupement des marqueurs par niveau de zoom.
- Chargées depuis un CDN (unpkg), aucune installation de dépendances nécessaire.

## Source des données

Jeu de données **« Bornes fontaine de la Métropole de Lyon »**, une compilation
des données Eau du Grand Lyon, des communes et d'OpenStreetMap, diffusée par la
Métropole de Lyon.

### Option A (utilisée en priorité) — API OGC API Features

L'app interroge directement, à chaque chargement de page :

```
https://data.grandlyon.com/geoserver/ogc/features/v1/collections/metropole-de-lyon:adr_voie_lieu.adrbornefontaine_latest/items?f=application/json&limit=2000
```

L'identifiant technique de la collection (`metropole-de-lyon:adr_voie_lieu.adrbornefontaine_latest`)
a été retrouvé en interrogeant la liste des collections du service
(`https://data.grandlyon.com/geoserver/ogc/features/v1/collections?f=application/json`)
et en cherchant l'entrée dont le titre correspond exactement à « Bornes fontaine
de la Métropole de Lyon ». Ce jeu de données contient ~876 points (au moment de
la rédaction) et propose les champs `identifiant`, `commune`, `insee`, `source`
et `anneepose`.

**Remarque** : il existe une autre collection, `metropole-de-lyon:eau.bornefontaine`
(« Fontaines d'eau potable de la Métropole de Lyon »), qui correspond au jeu
« officiel » plus restreint mentionné dans la demande initiale (~175 points,
Eau du Grand Lyon uniquement, propriétés `identifiantbornefontaine` /
`gestionnairedonnee`). Ce jeu n'a pas été retenu car moins complet ; le code
reste toutefois tolérant aux deux schémas de propriétés (voir
`buildPopupContent` dans `app.js`).

Le service a été testé et répond avec les en-têtes CORS `Access-Control-Allow-Origin: *`,
ce qui permet un appel direct depuis le navigateur : **aucun proxy backend n'a
été nécessaire**.

### Option B (secours automatique)

Si l'appel à l'API OGC échoue (CORS, panne, format inattendu, timeout), l'app
bascule automatiquement sur le fichier GeoJSON publié sur data.gouv.fr :

```
https://www.data.gouv.fr/api/1/datasets/r/dc3acf4b-a1fb-444b-83d2-777f145d4d7b
```

Ce fichier est régénéré régulièrement par le producteur, donc l'appeler à
chaque lancement respecte l'esprit de la contrainte « données à jour à chaque
ouverture », même en mode de secours.

Le fetch est fait avec `cache: "no-store"` : les données sont donc bien
récupérées sur le réseau à chaque nouveau lancement de l'app (pas de cache
serveur, pas de base de données locale persistante).

### Licence

Données diffusées sous licence **[ODbL](https://opendatacommons.org/licenses/odbl/1-0/)**
(Open Database License). En cas de redistribution des données ou d'une base de
données dérivée : mentionner la source (Métropole de Lyon / data.grandlyon.com)
et republier sous la même licence (partage à l'identique). L'attribution est
affichée dans le pied de page de l'app, sur les tuiles de la carte et dans la
fenêtre « À propos ».

## Fonctionnalités

- Géolocalisation du navigateur au chargement, avec centrage automatique sur
  Lyon centre-ville si l'utilisateur refuse ou si la géolocalisation échoue.
- Un marker (goutte d'eau) par point du jeu de données.
- Clustering dynamique par niveau de zoom (Leaflet.markercluster) : les points
  se regroupent en clusters (avec badge du nombre de points) en dézoomant, et
  se dégroupent progressivement jusqu'à afficher chaque point individuellement
  au zoom rue.
- Popup au clic sur un point, avec les informations disponibles dans le GeoJSON
  (identifiant, commune, code INSEE, source / gestionnaire, année de pose —
  seuls les champs réellement présents sont affichés).
- Indicateur de chargement pendant le fetch, message d'erreur avec bouton
  « Réessayer » si l'API ne répond pas.
- Compteur du nombre total de points chargés, affiché dans la barre de statut.
- Charte graphique bleue, logo et marqueurs en forme de goutte d'eau.

## Lancer le projet en local

Aucune dépendance à installer. Il faut simplement servir les fichiers statiques
(ouvrir `index.html` directement en `file://` fonctionne pour l'affichage, mais
la géolocalisation et certains navigateurs peuvent restreindre `fetch` en
`file://` — un serveur local est donc recommandé) :

```bash
cd points-eau-grand-lyon
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans un navigateur.

## Déploiement

Projet 100 % statique (HTML/CSS/JS + CDN), déployable tel quel sur Vercel,
Netlify ou GitHub Pages, sans configuration de build.

## Limites connues

- L'API OGC du Grand Lyon ne semble pas afficher de limite de débit
  explicite au moment de l'écriture, mais aucune garantie de disponibilité
  n'est fournie ; le mode de secours data.gouv.fr couvre les pannes
  ponctuelles.
- Certains points n'ont pas d'`identifiant` renseigné (valeur `null` dans le
  jeu de données) ; dans ce cas, l'app retombe sur l'identifiant technique
  (`gid`) ou n'affiche pas le champ.
- Le champ `anneepose` (année de pose) est vide pour la quasi-totalité des
  points au moment de la rédaction ; il n'apparaît dans la popup que lorsqu'il
  est renseigné.
- Il n'existe pas de champ « type de point » distinguant plusieurs catégories
  dans ce jeu de données : tous les points sont des bornes fontaine d'eau
  potable (les fontaines ornementales font l'objet d'un autre jeu de données,
  `metropole-de-lyon:adr_voie_lieu.adrfontaineornem_latest`, non inclus ici).
- La géolocalisation du navigateur nécessite un contexte sécurisé (HTTPS ou
  `localhost`) dans la plupart des navigateurs modernes.
