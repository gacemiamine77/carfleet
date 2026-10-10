"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { graviteInfraction, infractionSymbol } from "./MapView";

interface Pt {
  id: string; infraction: string; immatriculation?: string; carId?: string; conducteurNom?: string;
  lat: number; lon: number; speed?: number; speedLimit?: number; excess?: number | null; statut?: string; recordedAt?: string;
}

// Mini-carte de l'onglet Infractions : affiche les points affichés dans le tableau
// (aujourd'hui en mode Session). Indépendante de la carte principale.
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
    document.querySelectorAll(".mini-gravite-legend").forEach((el) => el.remove());
    const pts = (points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 1000);
    const bounds: [number, number][] = [];
    const comptes = new Map<"grave" | "moyen" | "faible", number>([
      ["grave", 0],
      ["moyen", 0],
      ["faible", 0],
    ]);
    if (chaleur) {
      L.heatLayer(
        pts.map((p) => {
          const gravite = graviteInfraction(p.infraction, p.excess);
          comptes.set(gravite.niveau, (comptes.get(gravite.niveau) || 0) + 1);
          return [p.lat, p.lon, 0.25 + (0.75 * gravite.score) / 100];
        }),
        { radius: 30, blur: 24, maxZoom: 14, minOpacity: 0.45 }
      ).addTo(layer);
      for (const p of pts) bounds.push([p.lat, p.lon]);
    } else {
      for (const inf of pts) {
        const gravite = graviteInfraction(inf.infraction, inf.excess);
        comptes.set(gravite.niveau, (comptes.get(gravite.niveau) || 0) + 1);
        const sym = infractionSymbol(inf.infraction);
        const st = inf.statut || "nouveau";
        L.marker([inf.lat, inf.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div title="Gravité ${gravite.score}/100" style="width:20px;height:20px;border-radius:9999px;background:${gravite.couleur};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;line-height:1;opacity:${st === "traite" ? 0.45 : 1};">${sym.glyph}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
        }).bindPopup(
          `<div style="font-size:12px;"><b>${sym.glyph} ${inf.infraction}</b><br/>🚗 ${inf.immatriculation || inf.carId || "?"}${inf.conducteurNom ? `<br/>${inf.conducteurNom}` : ""}<br/>Gravité: <b style="color:${gravite.couleur};">${gravite.score}/100 · ${gravite.label}</b></div>`
        ).addTo(layer);
        bounds.push([inf.lat, inf.lon]);
      }
    }
    const legend = new L.Control({ position: "bottomleft" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "mini-gravite-legend");
      div.style.cssText = "background:rgba(255,255,255,0.95);border:1px solid #ccc;border-radius:8px;padding:6px 8px;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,0.3);";
      const total = [...comptes.values()].reduce((a, b) => a + b, 0);
      div.innerHTML =
        `<b>🎯 Gravité (${total})</b><br/>` +
        `<div><span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#dc2626;border:1px solid #fff;box-shadow:0 0 0 1px #cbd5e1;margin-right:4px;"></span>Grave (≥ 80) <b>(${comptes.get("grave") || 0})</b></div>` +
        `<div><span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#f59e0b;border:1px solid #fff;box-shadow:0 0 0 1px #cbd5e1;margin-right:4px;"></span>Moyenne (≥ 50) <b>(${comptes.get("moyen") || 0})</b></div>` +
        `<div><span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#16a34a;border:1px solid #fff;box-shadow:0 0 0 1px #cbd5e1;margin-right:4px;"></span>Faible (&lt; 50) <b>(${comptes.get("faible") || 0})</b></div>`;
      return div;
    };
    legend.addTo(map);
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
