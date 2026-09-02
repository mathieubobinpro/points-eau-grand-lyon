"use strict";

/*
 * Points d'eau — Grand Lyon
 *
 * Source des données : jeu "Bornes fontaine de la Métropole de Lyon"
 * (compilation Eau du Grand Lyon + communes + OpenStreetMap), collection
 * OGC API Features `metropole-de-lyon:adr_voie_lieu.adrbornefontaine_latest`,
 * identifiée en interrogeant /collections. Cette collection est utilisée
 * plutôt que `metropole-de-lyon:eau.bornefontaine` (jeu "officiel" restreint,
 * ~175 points, Eau du Grand Lyon uniquement) car plus complète (~876 points)
 * et à jour, conformément à la consigne du prompt.
 *
 * Fallback : fichier GeoJSON data.gouv.fr, utilisé uniquement si l'appel à
 * l'API OGC échoue (CORS, panne, format inattendu).
 */

const OGC_ITEMS_URL =
  "https://data.grandlyon.com/geoserver/ogc/features/v1/collections/" +
  "metropole-de-lyon:adr_voie_lieu.adrbornefontaine_latest/items" +
  "?f=application/json&limit=2000";

const DATA_GOUV_FALLBACK_URL =
  "https://www.data.gouv.fr/api/1/datasets/r/dc3acf4b-a1fb-444b-83d2-777f145d4d7b";

const LYON_CENTER = [45.764043, 4.835659];
const DEFAULT_ZOOM = 13;

const DROP_PATH_D = "M12 2C7 8 4 12.5 4 16a8 8 0 0 0 16 0c0-3.5-3-8-8-14z";

function dropSvg() {
  return (
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="' + DROP_PATH_D + '"/></svg>'
  );
}

const els = {
  map: document.getElementById("map"),
  loadingOverlay: document.getElementById("loading-overlay"),
  errorBanner: document.getElementById("error-banner"),
  errorMessage: document.getElementById("error-message"),
  retryBtn: document.getElementById("retry-btn"),
  aboutBtn: document.getElementById("about-btn"),
  aboutDialog: document.getElementById("about-dialog"),
  locateBtn: document.getElementById("locate-btn"),
};

const waterIcon = L.divIcon({
  className: "water-marker-icon",
  html: dropSvg(),
  iconSize: [28, 28],
  iconAnchor: [14, 27],
  popupAnchor: [0, -24],
});

const userIcon = L.divIcon({
  className: "user-location-icon",
  html: '<span class="user-location-dot"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
});

function clusterSizeClass(count) {
  if (count >= 50) return "large";
  if (count >= 10) return "medium";
  return "small";
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const sizeClass = clusterSizeClass(count);
  const px = sizeClass === "large" ? 52 : sizeClass === "medium" ? 42 : 34;
  const html =
    '<div class="cluster-badge cluster-' + sizeClass + '">' + count + "</div>";
  return L.divIcon({
    html: html,
    className: "cluster-icon-wrapper",
    iconSize: L.point(px, px),
  });
}

const map = L.map(els.map, { zoomControl: true, attributionControl: false }).setView(LYON_CENTER, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

const clusterGroup = L.markerClusterGroup({
  iconCreateFunction: createClusterIcon,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  maxClusterRadius: 60,
});
map.addLayer(clusterGroup);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function buildPopupContent(feature) {
  const props = feature.properties || {};

  const id = firstDefined(
    props.identifiant,
    props.identifiantbornefontaine,
    props.gid,
    feature.id
  );
  const commune = firstDefined(props.commune);
  const insee = firstDefined(props.insee);
  const source = firstDefined(props.source, props.gestionnairedonnee);
  const anneePose = firstDefined(props.anneepose);

  const rows = [];
  if (id) rows.push(["Identifiant", id]);
  if (commune) rows.push(["Commune", commune]);
  if (insee) rows.push(["Code INSEE", insee]);
  if (source) rows.push(["Source / gestionnaire", source]);
  if (anneePose) rows.push(["Année de pose", anneePose]);

  const rowsHtml = rows
    .map(([label, value]) => "<dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd>")
    .join("");

  return (
    '<div class="water-popup">' +
    "<h3>Point d'eau potable</h3>" +
    (rowsHtml ? "<dl>" + rowsHtml + "</dl>" : "<p>Aucune information complémentaire disponible.</p>") +
    "</div>"
  );
}

function renderWaterPoints(geojson) {
  clusterGroup.clearLayers();

  const features = Array.isArray(geojson.features) ? geojson.features : [];

  const layer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: waterIcon }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(buildPopupContent(feature));
    },
  });

  clusterGroup.addLayer(layer);

  console.log(features.length + " points d'eau chargés");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " sur " + url);
  }
  return response.json();
}

async function loadWaterPoints() {
  try {
    const data = await fetchJson(OGC_ITEMS_URL);
    if (!data || !Array.isArray(data.features) || data.features.length === 0) {
      throw new Error("Réponse de l'API OGC Grand Lyon vide ou invalide");
    }
    return data;
  } catch (primaryError) {
    console.warn(
      "Option A (API OGC Grand Lyon) indisponible, bascule sur le fallback data.gouv.fr :",
      primaryError
    );
    try {
      const data = await fetchJson(DATA_GOUV_FALLBACK_URL);
      if (!data || !Array.isArray(data.features) || data.features.length === 0) {
        throw new Error("Réponse du fallback data.gouv.fr vide ou invalide");
      }
      return data;
    } catch (fallbackError) {
      console.error("Fallback data.gouv.fr également indisponible :", fallbackError);
      throw new Error(
        "Impossible de charger les points d'eau (API Grand Lyon et fallback data.gouv.fr indisponibles)."
      );
    }
  }
}

async function initData() {
  els.loadingOverlay.hidden = false;
  els.errorBanner.hidden = true;

  try {
    const geojson = await loadWaterPoints();
    renderWaterPoints(geojson);
    els.loadingOverlay.hidden = true;
  } catch (error) {
    els.loadingOverlay.hidden = true;
    els.errorMessage.textContent = error.message || "Erreur inconnue lors du chargement des données.";
    els.errorBanner.hidden = false;
  }
}

let userMarker = null;

function locateUser() {
  if (!("geolocation" in navigator)) {
    console.warn("Géolocalisation non supportée par ce navigateur.");
    map.setView(LYON_CENTER, DEFAULT_ZOOM);
    return;
  }

  els.locateBtn.classList.remove("is-error");
  els.locateBtn.classList.add("is-locating");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 15);
      if (userMarker) {
        userMarker.setLatLng([latitude, longitude]);
      } else {
        userMarker = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 1000 })
          .addTo(map)
          .bindPopup("Vous êtes ici");
      }
      els.locateBtn.classList.remove("is-locating");
    },
    (error) => {
      console.warn("Géolocalisation refusée ou indisponible :", error);
      els.locateBtn.classList.remove("is-locating");
      els.locateBtn.classList.add("is-error");
      setTimeout(() => els.locateBtn.classList.remove("is-error"), 2000);
      map.setView(LYON_CENTER, DEFAULT_ZOOM);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

els.retryBtn.addEventListener("click", initData);
els.aboutBtn.addEventListener("click", () => els.aboutDialog.showModal());
els.locateBtn.addEventListener("click", locateUser);

locateUser();
initData();
