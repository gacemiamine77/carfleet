"use client";
import { useState, useMemo, useRef, useEffect } from "react";

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
  infractions: Infraction[];
  onSelectCar?: (carId: string) => void;
  onClear?: () => void;
  onDisplayChange?: (list: Infraction[]) => void;
}

function ModeToggle({ showBase, setShowBase, loading, onRefresh }: { showBase: boolean; setShowBase: (v: boolean) => void; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="flex gap-1 items-center">
      <button onClick={() => setShowBase(false)} title="Infractions de la simulation en cours (mémoire, effacées à chaque Préparer)"
        className={`text-xs px-2 py-1 rounded border ${!showBase ? "bg-red-600 text-white border-red-600" : "bg-white hover:bg-red-50"}`}>▶️ Session</button>
      <button onClick={() => setShowBase(true)} title="Toutes les infractions persistées en base (jamais effacées)"
        className={`text-xs px-2 py-1 rounded border ${showBase ? "bg-red-600 text-white border-red-600" : "bg-white hover:bg-red-50"}`}>🗄️ Historique</button>
      {showBase && <button onClick={onRefresh} title="Recharger l'historique" className="text-xs bg-white border px-2 py-1 rounded hover:bg-red-50">{loading ? "⏳" : "🔄"}</button>}
    </div>
  );
}

function matchNom(i: { immatriculation?: string; carId?: string; conducteurNom?: string }, q: string): boolean {
  return (i.immatriculation || "").toLowerCase().includes(q) ||
    (i.carId || "").toLowerCase().includes(q) ||
    (i.conducteurNom || "").toLowerCase().includes(q);
}

export default function InfractionsList({ infractions, onSelectCar, onClear, onDisplayChange }: Props) {
  const displayCb = useRef(onDisplayChange);
  displayCb.current = onDisplayChange;
  const [filterInfraction, setFilterInfraction] = useState<string>("all");
  const [filterConducteur, setFilterConducteur] = useState<string>("all");
  const [filterStatut, setFilterStatut] = useState<string>("all");
  const [filterPeriode, setFilterPeriode] = useState<string>("all");
  const [filterJour, setFilterJour] = useState<string>("");
  const [filterPlaque, setFilterPlaque] = useState<string>("");
  const [showBase, setShowBase] = useState<boolean>(false);
  const [baseRows, setBaseRows] = useState<Infraction[]>([]);
  const [baseLoading, setBaseLoading] = useState<boolean>(false);

  const loadBase = async () => {
    setBaseLoading(true);
    try {
      const r = await fetch("/api/unites/infractions?limit=2000");
      const d = await r.json();
      const rows = (d.infractions || []).map((x: any) => ({
        id: String(x.externalId || x.id), carId: x.carId || "", immatriculation: x.immatriculation || "",
        conducteurNom: x.conducteurNom || "", roadName: x.roadName || "", troncon: x.troncon || "",
        infraction: x.infraction, restriction: x.restriction || undefined,
        speed: Number(x.vitesse) || 0, speedLimit: x.vitesseLimite == null ? 9999 : Number(x.vitesseLimite),
        excess: Number(x.exces) || 0, lat: Number(x.latitude), lon: Number(x.longitude),
        recordedAt: typeof x.recordedAt === "string" ? x.recordedAt : new Date(x.recordedAt).toISOString(),
        itineraireId: "", statut: x.statut || "nouveau", wilaya: x.wilaya, codeWilaya: x.codeWilaya,
      }));
      setBaseRows(rows);
    } catch { setBaseRows([]); }
    setBaseLoading(false);
  };

  const source = showBase ? baseRows : infractions;
  const conducteursSrc = useMemo(() => [...new Set(source.map(i => i.conducteurNom))].sort(), [source]);
  const typesSrc = useMemo(() => [...new Set(source.map(i => i.infraction))].sort(), [source]);
  const filteredSrc = useMemo(() => {
    const now = Date.now(), dayMs = 86400_000;
    const q = filterPlaque.trim().toLowerCase();
    return source.filter(i => {
      if (filterInfraction !== "all" && i.infraction !== filterInfraction) return false;
      if (filterConducteur !== "all" && i.conducteurNom !== filterConducteur) return false;
      if (filterStatut !== "all" && (i.statut || "nouveau") !== filterStatut) return false;
      if (q && !matchNom(i, q)) return false;
      if (filterJour) { if ((i.recordedAt || "").slice(0, 10) !== filterJour) return false; }
      else if (filterPeriode === "today") { if ((i.recordedAt || "").slice(0, 10) !== new Date(now).toISOString().slice(0, 10)) return false; }
      else if (filterPeriode === "7d") { if (new Date(i.recordedAt).getTime() < now - 7 * dayMs) return false; }
      else if (filterPeriode === "30d") { if (new Date(i.recordedAt).getTime() < now - 30 * dayMs) return false; }
      return true;
    });
  }, [source, filterInfraction, filterConducteur, filterStatut, filterPeriode, filterJour, filterPlaque]);

  // Remonte la liste affichée (session ou historique + filtres) pour la carte.
  // AVANT tout return anticipé (règles des hooks) ; notifie aussi le cas vide.
  useEffect(() => {
    displayCb.current?.(filteredSrc);
  }, [filteredSrc]);

  if (!source || source.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-4 border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">🚨 Infractions</h3>
          <div className="flex gap-2">
            <ModeToggle showBase={showBase} setShowBase={(v:boolean)=>{setShowBase(v); if(v) loadBase();}} loading={baseLoading} onRefresh={loadBase} />
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">0 infraction</span>
          </div>
        </div>
        <p className="text-xs text-gray-400">{showBase ? (baseLoading ? "⏳ Chargement de l'historique…" : "Aucune infraction en base.") : "Aucune infraction détectée."}</p>
      </div>
    );
  }

  const handleClear = async () => {
    if (onClear) onClear();
    else {
      await fetch("/api/simulation/infractions", { method: "DELETE" });
      window.location.reload();
    }
  };

  const handleExport = () => {
    if (showBase) {
      const params = new URLSearchParams({ format: "geojson", limit: "2000" });
      if (filterInfraction !== "all") params.set("infraction", filterInfraction);
      if (filterStatut !== "all") params.set("statut", filterStatut);
      if (filterPeriode !== "all") params.set("periode", filterPeriode);
      if (filterPlaque.trim()) params.set("q", filterPlaque.trim());
      window.open(`/api/unites/infractions?${params.toString()}`, "_blank");
      return;
    }
    const params = new URLSearchParams();
    if (filterInfraction !== "all") params.set("infraction", filterInfraction);
    if (filterConducteur !== "all") params.set("conducteur", filterConducteur);
    params.set("format", "geojson");
    window.open(`/api/simulation/infractions?${params.toString()}`, "_blank");
  };

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden flex flex-col h-full">
      <div className="flex flex-col gap-2 px-4 py-2 bg-red-50 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-red-800">🚨 Infractions — {filteredSrc.length}/{source.length}</h3>
          <div className="flex gap-2 items-center">
            <ModeToggle showBase={showBase} setShowBase={(v:boolean)=>{setShowBase(v); if(v) loadBase();}} loading={baseLoading} onRefresh={loadBase} />
            <button onClick={handleExport} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded">⬇️ GeoJSON</button>
            {!showBase && <button onClick={handleClear} className="text-xs bg-white border px-2 py-1 rounded hover:bg-red-50">🗑️ Effacer</button>}
            <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full animate-pulse">{source.length} total</span>
          </div>
        </div>
        <div className="flex gap-2">
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
          <select value={filterPeriode} onChange={e=>{setFilterPeriode(e.target.value); if(e.target.value!=="all") setFilterJour("");}} className="text-xs border rounded px-2 py-1 bg-white">
            <option value="all">Toutes dates</option>
            <option value="today">Aujourd'hui</option>
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
          </select>
          <input value={filterPlaque} onChange={e=>setFilterPlaque(e.target.value)} placeholder="🔍 Matricule, véhicule, nom…" className="text-xs border rounded px-2 py-1 bg-white w-40" />
          {(filterInfraction!=="all" || filterConducteur!=="all" || filterStatut!=="all" || filterPeriode!=="all" || filterJour || filterPlaque) && <button onClick={()=>{setFilterInfraction("all"); setFilterConducteur("all"); setFilterStatut("all"); setFilterPeriode("all"); setFilterJour(""); setFilterPlaque("");}} className="text-xs text-gray-500 underline">Réinitialiser</button>}
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-500">Jour précis :</label>
          <input type="date" value={filterJour} onChange={e=>{setFilterJour(e.target.value); if(e.target.value) setFilterPeriode("all");}} className="text-xs border rounded px-2 py-1 bg-white" />
          {filterJour && <button onClick={()=>setFilterJour("")} className="text-xs text-gray-500 underline">✕</button>}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
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
            {filteredSrc.length===0 ? (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">Aucune infraction pour ce filtre</td></tr>
            ) : filteredSrc.map((inf) => {
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
      </div>
    </div>
  );
}
