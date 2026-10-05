"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";

interface Infraction {
  id: string; carId: string; immatriculation: string; conducteurNom: string;
  roadName: string; troncon: string;
  infraction: string; restriction?: string;
  speed: number; speedLimit: number; excess: number;
  lat: number; lon: number;
  recordedAt: string; itineraireId: string;
  statut?: string; wilaya?: string; codeWilaya?: string;
}

interface Props {
  onSelectCar?: (carId: string) => void;
  onDisplayChange?: (list: Infraction[]) => void;
}

type Mode = "session" | "historique";
const AUTO_REFRESH_MS = 8000;

function ModeToggle({ mode, setMode, loading, onRefresh }: { mode: Mode; setMode: (m: Mode) => void; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="flex gap-1 items-center">
      <button onClick={() => setMode("session")} title="Infractions constatées aujourd'hui (lues en base, pas en mémoire)"
        className={`text-xs px-2 py-1 rounded border ${mode === "session" ? "bg-red-600 text-white border-red-600" : "bg-white hover:bg-red-50"}`}>▶️ Session (jour)</button>
      <button onClick={() => setMode("historique")} title="Toutes les infractions persistées en base, avec filtres période/type"
        className={`text-xs px-2 py-1 rounded border ${mode === "historique" ? "bg-red-600 text-white border-red-600" : "bg-white hover:bg-red-50"}`}>🗄️ Historique</button>
      <button onClick={onRefresh} title="Recharger maintenant" className="text-xs bg-white border px-2 py-1 rounded hover:bg-red-50">{loading ? "⏳" : "🔄"}</button>
    </div>
  );
}

function matchNom(i: { immatriculation?: string; carId?: string; conducteurNom?: string }, q: string): boolean {
  return (i.immatriculation || "").toLowerCase().includes(q) ||
    (i.carId || "").toLowerCase().includes(q) ||
    (i.conducteurNom || "").toLowerCase().includes(q);
}

// Toute infraction constatée vit en base (table infractions_constatees) ; ce composant ne
// garde plus aucune copie "mémoire" comme source d'affichage — il relit la base à chaque
// changement de filtre et périodiquement (AUTO_REFRESH_MS), que la simulation tourne ou non.
// Important : l'en-tête + les filtres restent TOUJOURS montés (même si 0 ligne), pour éviter
// tout flash/disparition pendant un chargement ou quand un filtre ne retourne rien.
export default function InfractionsList({ onSelectCar, onDisplayChange }: Props) {
  const displayCb = useRef(onDisplayChange);
  displayCb.current = onDisplayChange;

  const [mode, setMode] = useState<Mode>("session");
  const [rows, setRows] = useState<Infraction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [filterInfraction, setFilterInfraction] = useState<string>("all");
  const [filterConducteur, setFilterConducteur] = useState<string>("all");
  const [filterStatut, setFilterStatut] = useState<string>("all");
  const [filterPeriode, setFilterPeriode] = useState<string>("all"); // historique uniquement
  const [filterJour, setFilterJour] = useState<string>("");
  const [filterPlaque, setFilterPlaque] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "2000" });
      if (mode === "session") {
        params.set("periode", "today");
      } else if (filterPeriode !== "all" && !filterJour) {
        params.set("periode", filterPeriode);
      }
      if (filterInfraction !== "all") params.set("infraction", filterInfraction);
      if (filterStatut !== "all") params.set("statut", filterStatut);
      if (filterPlaque.trim()) params.set("q", filterPlaque.trim());
      const r = await fetch(`/api/unites/infractions?${params.toString()}`, { cache: "no-store" });
      const d = await r.json();
      const mapped: Infraction[] = (d.infractions || []).map((x: any) => ({
        id: String(x.externalId || x.id), carId: x.carId || "", immatriculation: x.immatriculation || "",
        conducteurNom: x.conducteurNom || "", roadName: x.roadName || "", troncon: x.troncon || "",
        infraction: x.infraction, restriction: x.restriction || undefined,
        speed: Number(x.vitesse) || 0, speedLimit: x.vitesseLimite == null ? 9999 : Number(x.vitesseLimite),
        excess: Number(x.exces) || 0, lat: Number(x.latitude), lon: Number(x.longitude),
        recordedAt: typeof x.recordedAt === "string" ? x.recordedAt : new Date(x.recordedAt).toISOString(),
        itineraireId: "", statut: x.statut || "nouveau", wilaya: x.wilaya, codeWilaya: x.codeWilaya,
      }));
      setRows(mapped);
      setTotal(d.total ?? mapped.length);
    } catch { setRows([]); setTotal(0); }
    setLoading(false);
    setLoadedOnce(true);
  }, [mode, filterInfraction, filterStatut, filterPeriode, filterJour, filterPlaque]);

  // Rechargement à chaque changement de filtre/mode
  useEffect(() => { load(); }, [load]);

  // Rafraîchissement périodique léger : remplace l'ancien "état mémoire" pour donner
  // un effet temps réel sans jamais faire de la mémoire la source de vérité.
  useEffect(() => {
    const t = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const conducteursSrc = useMemo(() => [...new Set(rows.map(i => i.conducteurNom))].sort(), [rows]);
  const typesSrc = useMemo(() => [...new Set(rows.map(i => i.infraction))].sort(), [rows]);

  const filteredSrc = useMemo(() => {
    const q = filterPlaque.trim().toLowerCase();
    return rows.filter(i => {
      if (filterConducteur !== "all" && i.conducteurNom !== filterConducteur) return false;
      if (q && !matchNom(i, q)) return false;
      if (mode === "historique" && filterJour && (i.recordedAt || "").slice(0, 10) !== filterJour) return false;
      return true;
    });
  }, [rows, filterConducteur, filterPlaque, filterJour, mode]);

  // Remonte la liste affichée (session ou historique + filtres) pour la carte.
  useEffect(() => {
    displayCb.current?.(filteredSrc);
  }, [filteredSrc]);

  const resetFilters = () => {
    setFilterInfraction("all"); setFilterConducteur("all"); setFilterStatut("all");
    setFilterPeriode("all"); setFilterJour(""); setFilterPlaque("");
  };

  const handleExport = () => {
    const params = new URLSearchParams({ format: "geojson", limit: "2000" });
    if (mode === "session") params.set("periode", "today");
    else if (filterPeriode !== "all" && !filterJour) params.set("periode", filterPeriode);
    if (filterInfraction !== "all") params.set("infraction", filterInfraction);
    if (filterStatut !== "all") params.set("statut", filterStatut);
    if (filterPlaque.trim()) params.set("q", filterPlaque.trim());
    window.open(`/api/unites/infractions?${params.toString()}`, "_blank");
  };

  const hasActiveFilter = filterInfraction !== "all" || filterConducteur !== "all" || filterStatut !== "all" ||
    (mode === "historique" && (filterPeriode !== "all" || !!filterJour)) || !!filterPlaque;

  // Message du corps du tableau : jamais de changement de mise en page, seulement de contenu.
  let bodyMessage: string | null = null;
  if (!loadedOnce && loading) bodyMessage = "⏳ Chargement…";
  else if (rows.length === 0) bodyMessage = mode === "session" ? "Aucune infraction aujourd'hui." : "Aucune infraction en base pour ce filtre.";
  else if (filteredSrc.length === 0) bodyMessage = "Aucune infraction pour ce filtre (conducteur/jour).";

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-full">
      <div className="flex flex-col gap-2 px-4 py-2 bg-red-50 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-red-800">🚨 Infractions — {filteredSrc.length}/{rows.length}</h3>
          <div className="flex gap-2 items-center">
            <ModeToggle mode={mode} setMode={setMode} loading={loading} onRefresh={load} />
            <button onClick={handleExport} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded">⬇️ GeoJSON</button>
            <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full animate-pulse">{total} {mode === "session" ? "aujourd'hui" : "au total (filtré)"}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={filterInfraction} onChange={e=>setFilterInfraction(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white">
            <option value="all">Toutes infractions</option>
            {typesSrc.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterConducteur} onChange={e=>setFilterConducteur(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white">
            <option value="all">Tous conducteurs</option>
            {conducteursSrc.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatut} onChange={e=>setFilterStatut(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white" title="Statut posé par les unités (app Android)">
            <option value="all">Tous statuts</option>
            <option value="nouveau">Nouveau</option>
            <option value="notifie">Notifié</option>
            <option value="traite">✅ Traité</option>
          </select>
          {mode === "historique" && (
            <select value={filterPeriode} onChange={e=>{setFilterPeriode(e.target.value); if(e.target.value!=="all") setFilterJour("");}} className="text-xs border rounded px-2 py-1 bg-white">
              <option value="all">Toutes dates</option>
              <option value="today">Aujourd'hui</option>
              <option value="7d">7 jours</option>
              <option value="30d">30 jours</option>
            </select>
          )}
          <input value={filterPlaque} onChange={e=>setFilterPlaque(e.target.value)} placeholder="🔍 Matricule, véhicule, nom…" className="text-xs border rounded px-2 py-1 bg-white w-40" />
          {hasActiveFilter && <button onClick={resetFilters} className="text-xs text-gray-500 underline">Réinitialiser</button>}
        </div>
        {mode === "historique" && (
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-500">Jour précis :</label>
            <input type="date" value={filterJour} onChange={e=>setFilterJour(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white" />
            {filterJour && <button onClick={()=>setFilterJour("")} className="text-xs text-gray-500 underline">✕</button>}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {bodyMessage ? (
          <p className="text-xs text-gray-400 text-center py-8">{bodyMessage}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-1.5">Heure</th>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Infraction</th>
                <th className="px-3 py-1.5">Véhicule</th>
                <th className="px-3 py-1.5">Conducteur</th>
                <th className="px-3 py-1.5">Tronçon</th>
                <th className="px-3 py-1.5">Vitesse</th>
                <th className="px-3 py-1.5">Limite</th>
                <th className="px-3 py-1.5">Excès</th>
                <th className="px-3 py-1.5">Statut unité</th>
                <th className="px-3 py-1.5">Position</th>
              </tr>
            </thead>
            <tbody>
              {filteredSrc.map((inf) => {
                const d = new Date(inf.recordedAt);
                const heure = d.toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const date = d.toLocaleDateString("fr-DZ");
                return (
                  <tr key={inf.id} className="border-t hover:bg-red-50 cursor-pointer" onClick={() => onSelectCar?.(inf.carId)} title="Centrer sur le véhicule">
                    <td className="px-3 py-1 font-mono">{heure}</td>
                    <td className="px-3 py-1">{date}</td>
                    <td className="px-3 py-1"><span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${inf.infraction==='zone interdite' ? 'bg-amber-100 text-amber-800' : inf.infraction==='circulation à contresens' ? 'bg-purple-100 text-purple-700' : inf.infraction==='conduite longue sans arrêt' ? 'bg-orange-100 text-orange-800' : inf.infraction==='arrêt interdit' ? 'bg-red-200 text-red-800' : inf.infraction==='stationnement interdit' ? 'bg-yellow-100 text-yellow-800' : inf.infraction==='impossible de comparée' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'}`}>{inf.infraction}</span></td>
                    <td className="px-3 py-1 font-mono">{inf.immatriculation} <span className="text-gray-400">({inf.carId})</span></td>
                    <td className="px-3 py-1">{inf.conducteurNom}</td>
                    <td className="px-3 py-1 max-w-[180px] truncate" title={inf.troncon + (inf.restriction ? ' — '+inf.restriction : '')}>{inf.roadName}{inf.restriction && <span className="text-amber-600"> ⚠️ {inf.restriction}</span>}</td>
                    <td className="px-3 py-1 font-bold text-red-600">{inf.speed.toFixed(0)} km/h</td>
                    <td className="px-3 py-1">{inf.speedLimit===9999 ? '—' : inf.speedLimit+' km/h'}</td>
                    <td className="px-3 py-1 font-bold text-red-700">{inf.infraction==='exces de vitesse' ? `+${inf.excess.toFixed(0)}` : '—'}</td>
                    <td className="px-3 py-1"><span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${(inf.statut||'nouveau')==='traite' ? 'bg-green-100 text-green-800' : (inf.statut||'nouveau')==='notifie' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`} title={inf.wilaya ? `Unité ${inf.codeWilaya} - ${inf.wilaya}` : 'Pas encore pris en charge'}>{(inf.statut||'nouveau')==='traite' ? '✅ Traité' : (inf.statut||'nouveau')==='notifie' ? 'Notifié' : 'Nouveau'}</span></td>
                    <td className="px-3 py-1 font-mono text-[11px]">{inf.lat.toFixed(4)}, {inf.lon.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
