"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Inf {
  id: number; carId?: string; immatriculation?: string; marque?: string; modele?: string;
  couleur?: string; conducteurNom?: string; categorieVehicule?: string; infraction: string;
  vitesse?: number; exces?: number; statut?: string; latitude: number; longitude: number; recordedAt: string;
}

interface Groupe {
  carId: string; immatriculation?: string; marque?: string; modele?: string; couleur?: string;
  conducteurNom?: string; categorieVehicule?: string;
  total: number; graves: number;
  parType: { type: string; count: number; graves: number }[];
  lastAt: string; lat: number; lon: number; derniereInfractionId: number;
}

function score(infraction: string, exces?: number): number {
  switch (infraction) {
    case "circulation à contresens": return 100;
    case "zone interdite": return 80;
    case "conduite longue sans arrêt": return 50;
    case "exces de vitesse": return 40 + Math.min(exces || 0, 60);
    case "arrêt interdit":
    case "stationnement interdit": return 30;
    case "impossible de comparée": return 10;
    default: return 20;
  }
}
const estGrave = (infraction: string, exces?: number) => score(infraction, exces) >= 50;

function libelle(g: Groupe): string {
  const veh = [g.marque, g.modele, g.couleur].filter((x) => x && x.trim()).join(" ");
  const parts: string[] = [];
  if (veh) parts.push(veh);
  if (g.immatriculation) parts.push(g.immatriculation);
  return parts.length ? parts.join(", ") : g.carId;
}

// Petite carte Leaflet du trajet emprunté.
function RouteMap({ carId }: { carId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [msg, setMsg] = useState("Chargement du trajet…");

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { center: [35.8, 3.0], zoom: 6 });
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap', subdomains: "abc", maxZoom: 20,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setMsg("Chargement du trajet…");
      try {
        const r = await fetch(`/api/unites/trajet?carId=${encodeURIComponent(carId)}`, { cache: "no-store" });
        const d = await r.json();
        if (cancel) return;
        const layer = layerRef.current, map = mapRef.current;
        if (!layer || !map) return;
        layer.clearLayers();
        const pts = (d.points || []).map((p: { lat: number; lon: number }) => [p.lat, p.lon] as [number, number]);
        if (pts.length < 2) { setMsg("Aucun trajet enregistré pour ce véhicule."); return; }
        L.polyline(pts, { color: "#dc2626", weight: 4 }).addTo(layer);
        L.circleMarker(pts[0], { radius: 6, color: "#16a34a", fillColor: "#16a34a", fillOpacity: 1 }).addTo(layer).bindPopup("Départ");
        L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1 }).addTo(layer).bindPopup("Position actuelle");
        map.fitBounds(pts as L.LatLngBoundsExpression, { padding: [20, 20] });
        setMsg("");
      } catch { setMsg("Impossible de charger le trajet."); }
    })();
    return () => { cancel = true; };
  }, [carId]);

  return (
    <div className="relative">
      <div ref={ref} className="w-full rounded-lg overflow-hidden border border-gray-200" style={{ height: "280px" }} />
      {msg && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-gray-500 rounded-lg">{msg}</div>}
    </div>
  );
}

// Onglet forces de sécurité : véhicules à infractions (résumé groupé) + chasse (alerte unités proches).
export default function VehiculesInfractions() {
  const [rows, setRows] = useState<Inf[]>([]);
  const [loading, setLoading] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [sel, setSel] = useState<Groupe | null>(null);
  const [unites, setUnites] = useState<any[] | null>(null);
  const [chasseEnCours, setChasseEnCours] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/unites/infractions?limit=2000", { cache: "no-store" });
      const d = await r.json();
      setRows(d.infractions || []);
    } catch { setRows([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const groupes: Groupe[] = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const byCar = new Map<string, Inf[]>();
    for (const x of rows) {
      if (x.infraction === "impossible de comparée") continue;
      const k = x.carId || x.immatriculation || "?";
      if (!byCar.has(k)) byCar.set(k, []);
      byCar.get(k)!.push(x);
    }
    const out: Groupe[] = [];
    for (const [carId, list] of byCar) {
      const last = list.reduce((a, b) => new Date(a.recordedAt) > new Date(b.recordedAt) ? a : b);
      const types = new Map<string, { count: number; graves: number }>();
      let graves = 0;
      for (const x of list) {
        const g = estGrave(x.infraction, x.exces);
        if (g) graves++;
        const t = types.get(x.infraction) || { count: 0, graves: 0 };
        t.count++; if (g) t.graves++;
        types.set(x.infraction, t);
      }
      const parType = [...types.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count);
      const first = <T,>(f: (x: Inf) => T | undefined): T | undefined => list.map(f).find((v) => v != null && String(v).trim() !== "");
      const g: Groupe = {
        carId,
        immatriculation: first((x) => x.immatriculation),
        marque: first((x) => x.marque), modele: first((x) => x.modele), couleur: first((x) => x.couleur),
        conducteurNom: first((x) => x.conducteurNom), categorieVehicule: first((x) => x.categorieVehicule),
        total: list.length, graves, parType,
        lastAt: last.recordedAt, lat: last.latitude, lon: last.longitude, derniereInfractionId: last.id,
      };
      if (q) {
        const hay = `${g.carId} ${g.immatriculation || ""} ${g.marque || ""} ${g.modele || ""} ${g.couleur || ""} ${g.conducteurNom || ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(g);
    }
    return out.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [rows, recherche]);

  const chasser = async (g: Groupe) => {
    setSel(g); setUnites(null); setChasseEnCours(true);
    try {
      const r = await fetch(`/api/unites/interception?carId=${encodeURIComponent(g.carId)}`, { cache: "no-store" });
      const d = await r.json();
      setUnites(d.unites || []);
    } catch { setUnites([]); }
    setChasseEnCours(false);
  };

  const alerter = async (g: Groupe, u: any) => {
    const r = await fetch("/api/unites/interception", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infractionId: g.derniereInfractionId, uniteId: u.id }),
    });
    const d = await r.json().catch(() => ({}));
    if (d.ok) { alert(`🚨 Unité ${u.code} alertée (${u.nom})`); load(); }
    else alert(d.error || "Erreur d'alerte");
  };

  return (
    <div className="bg-white rounded-xl shadow p-4 border space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-sm">🚗 Véhicules à infractions — {groupes.length}</h3>
        <div className="flex items-center gap-2">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="🔍 Plaque, véhicule, conducteur…" className="text-xs border rounded px-2 py-1.5 w-56" />
          <button onClick={load} className="text-xs bg-white border px-3 py-1.5 rounded hover:bg-blue-50">{loading ? "⏳" : "🔄"}</button>
        </div>
      </div>

      {sel && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-red-800">📍 Trajet — {libelle(sel)} <span className="text-gray-500 font-normal">({sel.carId})</span></h4>
            <button onClick={() => { setSel(null); setUnites(null); }} className="text-xs text-gray-500 underline">Fermer</button>
          </div>
          <RouteMap carId={sel.carId} />
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => chasser(sel)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded font-semibold">🚨 Chasser — alerter les unités proches</button>
            <span className="text-[11px] text-gray-500">{sel.total} infraction(s) · {sel.graves} grave(s)</span>
          </div>
          {chasseEnCours && <div className="text-xs text-gray-500">⏳ Recherche des unités proches…</div>}
          {unites && (
            unites.length === 0 ? (
              <div className="text-xs text-gray-500">Aucune unité mobile à proximité.</div>
            ) : (
              <div className="border rounded bg-white divide-y">
                {unites.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div>
                      <div className="font-medium">🚓 {u.nom} <span className="text-gray-400">({u.code})</span></div>
                      <div className="text-gray-500">📍 {u.distKm} km · ETA {u.etaMin} min · {u.type} · {u.moyen}{u.telephone ? ` · ${u.telephone}` : ""}</div>
                    </div>
                    <button onClick={() => alerter(sel, u)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-semibold">Alerter</button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <div className="max-h-[60vh] overflow-auto space-y-2">
        {groupes.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">Aucun véhicule à infractions. Lancez une simulation ou rechargez.</div>
        )}
        {groupes.map((g) => (
          <div key={g.carId} className="border rounded-lg p-3 hover:bg-red-50 cursor-pointer" onClick={() => chasser(g)}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">🚗 {libelle(g)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${g.graves > 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{g.total} inf. · {g.graves} graves</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {[g.carId !== g.immatriculation ? g.carId : "", g.conducteurNom, g.categorieVehicule].filter(Boolean).join(" · ")}
            </div>
            <div className="text-xs text-gray-700 mt-1 space-y-0.5">
              {g.parType.map((t) => (
                <div key={t.type}>• {t.count} {t.type}{t.graves > 0 ? ` (${t.graves} graves)` : ""}</div>
              ))}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">{new Date(g.lastAt).toLocaleString("fr-DZ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
