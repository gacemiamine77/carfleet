"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface CarFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    carId: string;
    immatriculation: string;
    marque: string;
    modele: string;
    couleurVoiture: string;
    typeVehicule: string;
    proprietaireType: string;
    proprietaireNom: string;
    proprietaireTel: string;
    conducteurNom: string;
    conducteurTel: string;
    conducteurPermis: string;
    speed: number;
    acceleration: number;
    heading: number;
    distanceKm: number;
    distanceTraveled: number;
    status: string;
    color: string;
    originCity: string;
    destinationCity: string;
    routeProgress: number;
    speedHistory?: number[]; 
  };
}

interface RouteInfo {
  points: { lat: number; lon: number }[];
  color: string;
  origin: string;
  destination: string;
}

interface InfractionPoint {
  id: string; infraction: string; immatriculation?: string; carId?: string; conducteurNom?: string;
  lat: number; lon: number; speed?: number; speedLimit?: number;
  statut?: string; recordedAt?: string;
}

interface Props {
  geojson: { type: "FeatureCollection"; features: CarFeature[] } | null;
  selectedCar: string | null;
  onSelectCar: (carId: string | null) => void;
  trails: Map<string, [number, number][]>;
  carRoutes: Record<string, RouteInfo>;
  carSpeeds?: Record<string, number[]>; // Historique des vitesses
  customRoads?: { features: { geometry: { type: "LineString"; coordinates: [number, number][] }; properties: any }[] } | null;
  onMapClick?: (lat: number, lon: number) => void;
  infractions?: InfractionPoint[];
  showInfractions?: boolean;
}

function infractionColor(infraction: string): string {
  switch (infraction) {
    case "exces de vitesse": return "#dc2626";
    case "zone interdite": return "#d97706";
    case "circulation à contresens": return "#7c3aed";
    case "conduite longue sans arrêt": return "#92400e";
    case "arrêt interdit":
    case "stationnement interdit": return "#ca8a04";
    default: return "#6b7280";
  }
}

// Fonction pour générer un graphique de vitesse en SVG
function generateSpeedChart(speeds: number[], color: string): string {
  if (!speeds || speeds.length < 2) return "";
  
  const width = 200;
  const height = 40;
  const maxSpeed = 180; // Échelle max fixe pour comparaison
  
  const points = speeds.map((s, i) => {
    const x = (i / (speeds.length - 1)) * width;
    const y = height - (Math.min(s, maxSpeed) / maxSpeed) * height;
    return `${x},${y}`;
  }).join(" ");

  return `
    <div style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;margin-bottom:2px;">
        <span>Vitesse (km/h)</span>
        <span>${Math.max(...speeds)} max</span>
      </div>
      <svg width="${width}" height="${height}" style="background:#f0f0f0;border-radius:4px;display:block;">
        <path d="M ${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />
        <line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="#ddd" stroke-dasharray="2,2" />
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:8px;color:#bbb;margin-top:2px;">
        <span>-30 pts</span>
        <span>Maintenant</span>
      </div>
    </div>
  `;
}

// Darken a hex color by a percentage
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = ((num >> 8) & 0x00ff) - amt;
  const B = (num & 0x0000ff) - amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 0 ? 0 : R > 255 ? 255 : R) * 0x10000 +
      (G < 0 ? 0 : G > 255 ? 255 : G) * 0x100 +
      (B < 0 ? 0 : B > 255 ? 255 : B)
    )
      .toString(16)
      .slice(1)
  );
}

// SVG car marker
function carIcon(color: string, heading: number, selected: boolean): L.DivIcon {
  const size = selected ? 32 : 24;
  const glow = selected ? `filter: drop-shadow(0 0 8px ${color});` : "";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;transform:rotate(${heading}deg);${glow}">
      <svg viewBox="0 0 24 24" width="${size}" height="${size}">
        <path d="M12 1L7 9L7 20L9 22L15 22L17 20L17 9Z" fill="${color}" stroke="#fff" stroke-width="1"/>
        <circle cx="12" cy="6" r="2" fill="#fff" opacity="0.8"/>
        <rect x="8" y="14" width="3" height="2" rx="0.5" fill="#fff" opacity="0.5"/>
        <rect x="13" y="14" width="3" height="2" rx="0.5" fill="#fff" opacity="0.5"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapView({ geojson, selectedCar, onSelectCar, trails, carRoutes, carSpeeds, customRoads, onMapClick, infractions, showInfractions }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const trailLinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const routeLinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const customRoadsRef = useRef<L.Polyline[]>([]);
  const infractionsLayerRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  useEffect(()=>{ onMapClickRef.current = onMapClick; }, [onMapClick]);

  // Initialize map centered on Northern Algeria
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [35.8, 3.0],
      zoom: 7,
      zoomControl: true,
      minZoom: 5,
      maxZoom: 18,
    });

    // Multi-fonds sans clé + sélecteur en haut à droite (défaut : OSM France)
    const baseMaps: Record<string, L.TileLayer> = {
      "🇫🇷 OSM France": L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap France | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        subdomains: "abc", maxZoom: 20,
      }),
      "🧡 OSM Humanitaire": L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.hotosm.org/">Humanitarian OSM Team</a> | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        subdomains: "abc", maxZoom: 20,
      }),
      "🏔️ OSM Topo": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        attribution: 'Map data: &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
        subdomains: "abc", maxZoom: 17,
      }),
      "🛣️ Esri Rues": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 19,
      }),
      "⛰️ Esri Topo": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 19,
      }),
      "🛰️ Esri Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
      }),
      "🗺️ CARTO Clair": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd", maxZoom: 19,
      }),
      "🌙 CARTO Sombre": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd", maxZoom: 19,
      }),
    };
    baseMaps["🇫🇷 OSM France"].addTo(map);
    L.control.layers(baseMaps).addTo(map);

    // Fit to Northern Algeria & High Plateaus bounds (including Laghouat)
    map.fitBounds([
      [33.0, -2.5],  // SW (Lowered to 33.0 to include Laghouat/Biskra)
      [37.5, 9.0],   // NE
    ]);

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update car markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson || !Array.isArray(geojson.features)) return;

    const currentIds = new Set<string>();

    for (const feature of geojson.features) {
      if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) continue;
      const coords = feature.geometry.coordinates as [number, number];
      if (coords.length < 2) continue;
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const p = feature.properties as CarFeature["properties"];
      if (!p || !p.carId) continue;
      currentIds.add(p.carId);

      const isSelected = p.carId === selectedCar;
      const icon = carIcon(p.color, p.heading, isSelected);

      let marker = markersRef.current.get(p.carId);
      try {
        if (marker) {
          marker.setLatLng([lat, lon] as L.LatLngExpression);
          marker.setIcon(icon);
          marker.setZIndexOffset(isSelected ? 1000 : 0);
        } else {
          marker = L.marker([lat, lon] as L.LatLngExpression, {
            icon,
            zIndexOffset: isSelected ? 1000 : 0,
          });
          marker.addTo(map);
          markersRef.current.set(p.carId, marker);
        }
      } catch (e) {
        console.warn(`[MapView] invalid lat/lon for ${p.carId}:`, lat, lon, e);
        continue;
      }

      // Attach click handler
      marker.off("click");
      marker.on("click", () => {
        onSelectCar(p.carId === selectedCar ? null : p.carId);
      });

      // Update popup
      const speedColor = p.speed > 80 ? "#e74c3c" : p.speed > 40 ? "#f39c12" : "#2ecc71";
      const isTerminatedPopup = p.status === "terminé" || p.status === "arrivée" || p.status === "termine";
      const statusColor = p.status === "en route" ? "#2ecc71" : isTerminatedPopup ? "#111827" : p.status === "arrêt temporaire" ? "#e74c3c" : "#f39c12";
      
      const speedHistory = carSpeeds?.[p.carId] || [];
      const speedChartHtml = generateSpeedChart(speedHistory, p.color);

      marker.bindPopup(`
        <div style="min-width:250px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;padding:2px;">
          <div style="font-weight:800;color:${p.color};font-size:16px;border-bottom:2px solid ${p.color};padding-bottom:5px;margin-bottom:8px;display:flex;justify-content:between;">
            <span>🚗 ${p.carId}</span>
            <span style="font-size:10px;background:#eee;padding:2px 6px;border-radius:4px;color:#666;margin-left:auto;">${p.immatriculation}</span>
          </div>
          
          <div style="margin-bottom:8px;">
            <div style="font-weight:700;color:#444;">🚙 Véhicule</div>
            <div style="color:#666;"><b>${p.marque} ${p.modele}</b> (${p.couleurVoiture})</div>
            <div style="font-size:11px;color:#888;">Type: ${p.typeVehicule || "Léger"}</div>
          </div>

          <div style="margin-bottom:8px;padding:6px;background:#eef2ff;border-radius:6px;border-left:4px solid #4f46e5;">
            <div style="font-weight:700;color:#3730a3;">🧑‍✈️ Conducteur</div>
            <div><b>${p.conducteurNom}</b></div>
            <div>📞 ${p.conducteurTel}</div>
            <div style="font-size:11px;color:#6366f1;">Permis: ${p.conducteurPermis}</div>
          </div>

          <div style="margin-bottom:8px;padding:6px;background:#f5f3ff;border-radius:6px;border-left:4px solid #7c3aed;">
            <div style="font-weight:700;color:#5b21b6;">🏢 Propriétaire (${p.proprietaireType})</div>
            <div><b>${p.proprietaireNom}</b></div>
            <div>📞 ${p.proprietaireTel}</div>
          </div>

          <div style="margin:8px 0;padding:8px;background:#f8f9fa;border-radius:6px;border:1px solid #eee;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span>Vitesse:</span>
              <b style="color:${speedColor}">${p.speed} km/h</b>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span>Accel:</span>
              <b style="color:${p.acceleration > 0 ? '#22c55e' : p.acceleration < 0 ? '#ef4444' : '#666'}">${p.acceleration > 0 ? '+' : ''}${p.acceleration} km/h/s</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span>Statut:</span>
              <span style="color:${statusColor};font-weight:700">${p.status.toUpperCase()}</span>
            </div>
            ${speedChartHtml}
          </div>

          <div style="font-size:11px;color:#166534;background:#f0fdf4;padding:6px;border-radius:6px;border:1px solid #bbf7d0;">
            <b>📍 Itinéraire :</b><br/>
            ${p.originCity} ➔ ${p.destinationCity || "..."}
            <div style="width:100%;height:4px;background:#dcfce7;border-radius:2px;margin-top:4px;">
              <div style="width:${p.routeProgress}%;height:100%;background:#22c55e;border-radius:2px;"></div>
            </div>
          </div>
        </div>
      `, { maxWidth: 350 });

      if (isSelected) {
        marker.openPopup();
      }
    }

    // Remove old markers
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [geojson, selectedCar, onSelectCar]);

  // Update trails (breadcrumb path)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const [carId, points] of trails) {
      if (!Array.isArray(points) || points.length < 2) continue;
      // filter invalid points
      const validPoints = points.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      if (validPoints.length < 2) continue;

      const feature = geojson?.features.find((f) => f.properties?.carId === carId);
      const color = feature?.properties.color ?? "#3388ff";

      let line = trailLinesRef.current.get(carId);
      // Darken the trail color significantly (40%) and increase thickness
      const darkTrailColor = darkenColor(color, 40); 

      if (line) {
        line.setLatLngs(validPoints as L.LatLngExpression[]);
        line.setStyle({ 
          color: darkTrailColor, 
          opacity: 0.85, 
          weight: 6,
          lineCap: 'round',
          lineJoin: 'round'
        });
      } else {
        line = L.polyline(validPoints as L.LatLngExpression[], {
          color: darkTrailColor,
          weight: 6,
          opacity: 0.85,
          smoothFactor: 0, // Désactive la simplification pour garder TOUS les points
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        trailLinesRef.current.set(carId, line);
      }
    }

    for (const [carId, line] of trailLinesRef.current) {
      if (!trails.has(carId)) {
        line.remove();
        trailLinesRef.current.delete(carId);
      }
    }
  }, [trails, geojson]);

  // Update planned route lines (dashed, only for selected car or all)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const routeIds = new Set<string>();

    for (const [carId, route] of Object.entries(carRoutes)) {
      // Only show route for selected car, or all if none selected
      if (selectedCar && carId !== selectedCar) continue;
      if (route.points.length < 2) continue;

      routeIds.add(carId);
      const latLngs: [number, number][] = route.points
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => [p.lat, p.lon]);
      if (latLngs.length < 2) continue;

      let line = routeLinesRef.current.get(carId);
      if (line) {
        line.setLatLngs(latLngs);
        line.setStyle({ color: route.color, opacity: 0.35 });
      } else {
        line = L.polyline(latLngs, {
          color: route.color,
          weight: 4,
          opacity: 0.35,
          dashArray: "8,12",
        }).addTo(map);
        routeLinesRef.current.set(carId, line);
      }
    }

    // Remove old route lines
    for (const [carId, line] of routeLinesRef.current) {
      if (!routeIds.has(carId)) {
        line.remove();
        routeLinesRef.current.delete(carId);
      }
    }
  }, [carRoutes, selectedCar]);

  // Custom roads - thin dark line (noir / bleu nuit)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Clear old
    customRoadsRef.current.forEach(l => l.remove());
    customRoadsRef.current = [];
    if (!customRoads?.features?.length) return;
    for (const f of customRoads.features) {
      if (!f.geometry || f.geometry.type !== "LineString" || !Array.isArray(f.geometry.coordinates)) continue;
      const latLngs = f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]).filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b));
      if (latLngs.length < 2) continue;
      const line = L.polyline(latLngs as L.LatLngExpression[], {
        color: "#0f172a", // bleu nuit / noir fin
        weight: 1.8,
        opacity: 0.85,
        smoothFactor: 0,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
      customRoadsRef.current.push(line);
    }
  }, [customRoads]);

  // Pan to selected car
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCar || !geojson || !Array.isArray(geojson.features)) return;
    const feature = geojson.features.find((f) => f.properties?.carId === selectedCar);
    if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) return;
    const [lon, lat] = feature.geometry.coordinates as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.panTo([lat, lon] as L.LatLngExpression, { animate: true, duration: 0.5 });
  }, [selectedCar, geojson]);

  // Infractions sur la carte (affichable/masquable, max 500 points)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!infractionsLayerRef.current) {
      infractionsLayerRef.current = L.layerGroup().addTo(map);
    }
    const layer = infractionsLayerRef.current;
    layer.clearLayers();
    if (!showInfractions || !infractions?.length) return;
    for (const inf of infractions.slice(0, 500)) {
      if (!Number.isFinite(inf.lat) || !Number.isFinite(inf.lon)) continue;
      const st = inf.statut || "nouveau";
      const statutTxt = st === "traite" ? "✅ Traité" : st === "notifie" ? "Notifié" : "Nouveau";
      const dateTxt = inf.recordedAt ? new Date(inf.recordedAt).toLocaleString("fr-DZ") : "";
      L.circleMarker([inf.lat, inf.lon], {
        radius: 7, color: infractionColor(inf.infraction), weight: 2,
        fillColor: infractionColor(inf.infraction), fillOpacity: st === "traite" ? 0.35 : 0.85,
      }).bindPopup(
        `<div style="font-size:12px;min-width:180px;">
          <b>🚨 ${inf.infraction}</b><br/>
          🚗 ${inf.immatriculation || inf.carId || "?"}${inf.conducteurNom ? `<br/>🧑‍✈️ ${inf.conducteurNom}` : ""}
          ${inf.speed != null ? `<br/>Vitesse: <b>${inf.speed} km/h</b>${inf.speedLimit != null && inf.speedLimit !== 9999 ? ` (limite ${inf.speedLimit})` : ""}` : ""}
          <br/>Statut: <b>${statutTxt}</b>
          ${dateTxt ? `<br/>${dateTxt}` : ""}
        </div>`
      ).addTo(layer);
    }
  }, [infractions, showInfractions]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden shadow-lg border border-gray-200"
      style={{ minHeight: "400px" }}
    />
  );
}
