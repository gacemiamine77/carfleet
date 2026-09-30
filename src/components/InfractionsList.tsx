"use client";
import { useState, useMemo } from "react";

interface Infraction {
  id: string; carId: string; immatriculation: string; conducteurNom: string;
  roadName: string; troncon: string;
  infraction: string; restriction?: string;
  speed: number; speedLimit: number; excess: number;
  lat: number; lon: number;
  recordedAt: string; itineraireId: string;
}

interface Props {
  infractions: Infraction[];
  onSelectCar?: (carId: string) => void;
  onClear?: () => void;
}

export default function InfractionsList({ infractions, onSelectCar, onClear }: Props) {
  const [filterInfraction, setFilterInfraction] = useState<string>("all");
  const [filterConducteur, setFilterConducteur] = useState<string>("all");

  const conducteurs = useMemo(() => [...new Set(infractions.map(i => i.conducteurNom))].sort(), [infractions]);
  const infractionsTypes = useMemo(() => [...new Set(infractions.map(i => i.infraction))].sort(), [infractions]);

  const filtered = useMemo(() => infractions.filter(i =>
    (filterInfraction === "all" || i.infraction === filterInfraction) &&
    (filterConducteur === "all" || i.conducteurNom === filterConducteur)
  ), [infractions, filterInfraction, filterConducteur]);

  if (!infractions || infractions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-4 border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">🚨 Infractions</h3>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">0 infraction</span>
        </div>
        <p className="text-xs text-gray-400">Aucune infraction détectée.</p>
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
          <h3 className="font-bold text-sm text-red-800">🚨 Infractions — {filtered.length}/{infractions.length}</h3>
          <div className="flex gap-2">
            <button onClick={handleExport} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded">⬇️ GeoJSON</button>
            <button onClick={handleClear} className="text-xs bg-white border px-2 py-1 rounded hover:bg-red-50">🗑️ Effacer</button>
            <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full animate-pulse">{infractions.length} total</span>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={filterInfraction} onChange={e=>setFilterInfraction(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white">
            <option value="all">Toutes infractions</option>
            {infractionsTypes.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterConducteur} onChange={e=>setFilterConducteur(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white">
            <option value="all">Tous conducteurs</option>
            {conducteurs.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
          {(filterInfraction!=="all" || filterConducteur!=="all") && <button onClick={()=>{setFilterInfraction("all"); setFilterConducteur("all");}} className="text-xs text-gray-500 underline">Réinitialiser</button>}
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
              <th className="px-3 py-1.5">Position</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 ? (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">Aucune infraction pour ce filtre</td></tr>
            ) : filtered.map((inf) => {
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
