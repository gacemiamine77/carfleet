"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { infractionSymbol } from "./MapView";

interface Pt {
  id: string; infraction: string; immatriculation?: string; carId?: string; conducteurNom?: string;
  lat: number; lon: number; speed?: number; speedLimit?: number; statut?: string; recordedAt?: string;
}

// Mini-carte de l'onglet Infractions : affiche les points affichés dans le tableau
// (aujourd'hui en mode Session). Indépendante de la carte principale.
function intensiteChaleur(infraction: string): number {
  switch (infraction) {
    case "circulation à contresens": return 1;
    case "zone interdite": return 0.85;
    case "conduite longue sans arrêt": return 0.65;
    case "exces de vitesse": return 0.55;
    case "arrêt interdit":
    case "stationnement interdit": return 0.4;
    default: return 0.3;
  }
}

export default function InfractionsMiniMap({ points }: { points: Pt[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [chaleur, setChaleur] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [35.8, 3.0], zoom: 6, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap France | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      subdomains: "abc",
      maxZoom: 20,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Le conteneur vient d'apparaître : recalcule la taille puis cadre
    setTimeout(() => { map.invalidateSize(); }, 50);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts = (points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 1000);
    const bounds: [number, number][] = [];
    if (chaleur) {
      L.heatLayer(
        pts.map((p) => [p.lat, p.lon, intensiteChaleur(p.infraction)]),
        { radius: 30, blur: 24, maxZoom: 14, minOpacity: 0.45 }
      ).addTo(layer);
      for (const p of pts) bounds.push([p.lat, p.lon]);
    } else {
      for (const inf of pts) {
      const sym = infractionSymbol(inf.infraction);
      const st = inf.statut || "nouveau";
      L.marker([inf.lat, inf.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:18px;line-height:18px;color:${sym.color};opacity:${st === "traite" ? 0.45 : 1};text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff;">${sym.glyph}</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).bindPopup(
        `<div style="font-size:12px;"><b>${sym.glyph} ${inf.infraction}</b><br/>🚗 ${inf.immatriculation || inf.carId || "?"}${inf.conducteurNom ? `<br/>${inf.conducteurNom}` : ""}</div>`
      ).addTo(layer);
      bounds.push([inf.lat, inf.lon]);
      }
    }
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [20, 20] });
    map.invalidateSize();
  }, [points, chaleur]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setChaleur((v) => !v)}
        title="Basculer entre points et densité"
        className={`absolute top-2 right-2 z-[1000] text-xs px-2 py-1 rounded border shadow ${chaleur ? "bg-red-600 text-white border-red-600" : "bg-white/95 hover:bg-red-50"}`}
      >
        {chaleur ? "📍 Points" : "🔥 Chaleur"}
      </button>
      <div ref={containerRef} className="w-full rounded-xl overflow-hidden border border-gray-200" style={{ height: "300px" }} />
    </div>
  );
}
