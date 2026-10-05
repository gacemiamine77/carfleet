"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect } from "react";
import ControlPanel from "@/components/ControlPanel";
import CarList from "@/components/CarList";
import DbViewer from "@/components/DbViewer";
import ExportPanel from "@/components/ExportPanel";
import UploadRoads from "@/components/UploadRoads";
import StatsDashboard from "@/components/StatsDashboard";
import InfractionsList from "@/components/InfractionsList";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-200 rounded-xl flex items-center justify-center">
      <div className="text-gray-500 animate-pulse text-lg">🗺️ Chargement de la carte Algérie Nord...</div>
    </div>
  ),
});

interface CarInfo {
  carId: string;
  immatriculation?: string;
  marque?: string;
  modele?: string;
  couleurVoiture?: string;
  proprietaireType?: string;
  proprietaireNom?: string;
  proprietaireTel?: string;
  proprietaireWilaya?: string;
  conducteurNom?: string;
  conducteurTel?: string;
  conducteurPermis?: string;
  itineraireId?: string;
  itineraireStatut?: string;
  speed: number;
  acceleration?: number;
  status: string;
  color: string;
  distanceKm?: number;
  totalDistanceKm?: number;
  originCity?: string;
  destinationCity?: string;
  routeProgress?: number;
}

interface BufferStats {
  totalRecords: number;
  sizeKb: number;
  elapsedMinutes: number;
}

interface RouteInfo {
  points: { lat: number; lon: number }[];
  color: string;
  origin: string;
  destination: string;
}

export default function Home() {
  const [config, setConfig] = useState({
    numCars: 4,
    recordIntervalSec: 1,
    timeMultiplier: 60,
    flushThresholdKb: 50,
    flushThresholdMinutes: 2,
    selectedWilayas: [] as string[],
    vehicleCategories: undefined as string[] | undefined,
    simulateContresens: false as boolean | undefined,
    maxContinuousDrivingHours: 4 as number | undefined,
    customOrigin: null as string | null,
    customDestination: null as string | null,
    sourceDonnees: "aleatoire" as "aleatoire" | "registre",
  });

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [geojson, setGeojson] = useState<any>(null);
  const [cars, setCars] = useState<CarInfo[]>([]);
  const [selectedCar, setSelectedCar] = useState<string | null>(null);
  const [bufferStats, setBufferStats] = useState<BufferStats>({
    totalRecords: 0,
    sizeKb: 0,
    elapsedMinutes: 0,
  });
  const [totalInDb, setTotalInDb] = useState(0);
  const [lastFlushMsg, setLastFlushMsg] = useState("");
  const [dbViewerOpen, setDbViewerOpen] = useState(false);
  const [trails, setTrails] = useState<Map<string, [number, number][]>>(new Map());
  const [carSpeeds, setCarSpeeds] = useState<Record<string, number[]>>({});
  const [carRoutes, setCarRoutes] = useState<Record<string, RouteInfo>>({});
  const [initLoading, setInitLoading] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [mapInfractions, setMapInfractions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"carte" | "infractions" | "panneaux" | "unites" | "vehicules">("carte");
  const [customRoads, setCustomRoads] = useState<any>(null);
  const [selectingItineraryFor, setSelectingItineraryFor] = useState<string | null>(null);
  const [pendingItinerary, setPendingItinerary] = useState<{ carId: string; origin?: [number, number]; destination?: [number, number] } | null>(null);
  const [panneaux, setPanneaux] = useState<any[]>([]);
  const [unites, setUnites] = useState<any[]>([]);
  const [vehiculesInscrits, setVehiculesInscrits] = useState<any[]>([]);
  const [searchVeh, setSearchVeh] = useState("");
  const [searchVehRO, setSearchVehRO] = useState(true);
  const [comptes, setComptes] = useState<any[]>([]);
  const [cWilaya, setCWilaya] = useState("");
  const [cCorps, setCCorps] = useState("");
  const [cMoyen, setCMoyen] = useState("");
  const [cUnite, setCUnite] = useState("");
  const [cUser, setCUser] = useState("");
  const [cPass, setCPass] = useState("");
  const [cMsg, setCMsg] = useState("");

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoFlushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(running);
  const configRef = useRef(config);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const handler = (e: any) => {
      const carId = e.detail as string;
      setSelectingItineraryFor(carId);
      setPendingItinerary({ carId });
      setActiveTab("carte");
    };
    window.addEventListener('select-itinerary' as any, handler);
    return () => window.removeEventListener('select-itinerary' as any, handler);
  }, []);

  useEffect(() => {
    if (activeTab !== "panneaux") return;
    fetch("/api/simulation/stops").then(r=>r.json()).then(d=> setPanneaux(d.features || [])).catch(()=> setPanneaux([]));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "unites") return;
    // Unités lues depuis la table unites_securite (pas du GeoJSON)
    fetch("/api/unites").then(r=>r.json()).then(d=> setUnites(d.unites || [])).catch(()=> setUnites([]));
    fetch("/api/unites/comptes").then(r=>r.json()).then(d=> setComptes(d.comptes || [])).catch(()=> setComptes([]));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "vehicules") return;
    fetch("/api/admin/vehicules-inscrits").then(r=>r.json()).then(d=> setVehiculesInscrits(d.vehicules || [])).catch(()=> setVehiculesInscrits([]));
  }, [activeTab]);

  const reverseGeocodeFE = async (lat:number, lon:number) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16`, { headers: { "Accept-Language": "fr,ar" } });
      if (!r.ok) return null;
      const d:any = await r.json();
      const a=d.address||{};
      return d.name || a.road || a.village || a.town || a.city || a.county || d.display_name?.split(",").slice(0,2).join(", ") || null;
    } catch { return null; }
  };
  const handleMapClick = useCallback(async (lat: number, lon: number) => {
    if (!selectingItineraryFor) return;
    const carId = selectingItineraryFor;
    if (!pendingItinerary || !pendingItinerary.origin) {
      const name = await reverseGeocodeFE(lat, lon);
      setPendingItinerary({ carId, origin: [lat, lon] });
      setLastFlushMsg(`📍 Départ pour ${carId} : ${name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`} — clique l'arrivée`);
      // Met à jour fiche véhicule immédiatement avec le nom du lieu
      setCars(prev => prev.map(c => c.carId===carId ? { ...c, originCity: name || `${lat.toFixed(3)},${lon.toFixed(3)}` } : c));
    } else if (pendingItinerary.carId === carId && !pendingItinerary.destination) {
      const origin = pendingItinerary.origin!;
      const dest: [number, number] = [lat, lon];
      const dName = await reverseGeocodeFE(lat, lon);
      setPendingItinerary(null);
      setSelectingItineraryFor(null);
      const res = await fetch("/api/simulation/set-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carId, origin: { lat: origin[0], lon: origin[1] }, destination: { lat: dest[0], lon: dest[1] } }),
      });
      let data: any = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.ok && data?.ok) {
        const oName = data.origin?.name || `${origin[0].toFixed(3)},${origin[1].toFixed(3)}`;
        setLastFlushMsg(`✅ Itinéraire perso pour ${carId} : ${oName} → ${dName || `${lat.toFixed(3)},${lon.toFixed(3)}`}`);
        // Met à jour fiche véhicule avec les noms extraits
        setCars(prev => prev.map(c => c.carId===carId ? { ...c, originCity: oName, destinationCity: dName || `${lat.toFixed(3)},${lon.toFixed(3)}` } : c));
        fetch("/api/simulation/tick", { method: "POST" });
      } else setLastFlushMsg(data?.error || `Erreur itinéraire (${res.status})`);
    }
  }, [selectingItineraryFor, pendingItinerary]);

  const handlePrepare = useCallback(async () => {
    setInitLoading(true);
    const res = await fetch("/api/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...config }),
    });
    const data = await res.json();
    if (!data.ok) { setInitLoading(false); return; }
    setSessionId(data.sessionId);
    setGeojson(data.carsGeoJSON);
    setCars(data.carsList ?? []);
    setCarRoutes(data.carRoutes ?? {});
    setTrails(new Map());
    setPrepared(true);
    setPaused(false);
    setInitLoading(false);
    setLastFlushMsg(data.registreVide
      ? "⚠️ Registre vide — repli sur véhicules aléatoires"
      : data.sourceDonnees === "registre"
        ? "✅ Véhicules inscrits prêts (vrais noms) — GO"
        : "✅ Voitures et chemins prêts — fixez les croquis vitesse puis GO");
  }, [config]);

  const handleGo = useCallback(async () => {
    if (!prepared) await handlePrepare();
    setInitLoading(true);
    await fetch("/api/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    setRunning(true);
    setPaused(false);
    setInitLoading(false);

    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(async () => {
      if (!runningRef.current) return;
      try {
        const tickRes = await fetch("/api/simulation/tick", { method: "POST" });
        const tickData = await tickRes.json();
        if (tickData.error) {
          // Simulation arrêtée côté serveur
          setRunning(false);
          runningRef.current = false;
          if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
          if (autoFlushRef.current) clearInterval(autoFlushRef.current);
          setLastFlushMsg("✅ Simulation terminée — tous les itinéraires sont arrivés");
          return;
        }
        if (tickData.carsGeoJSON) {
          setGeojson(tickData.carsGeoJSON);
          setCars(tickData.carsList ?? []);
          setBufferStats(
            tickData.bufferStats ?? { totalRecords: 0, sizeKb: 0, elapsedMinutes: 0 }
          );
          setTotalInDb(tickData.totalRecordsSentToDb ?? 0);
          if (tickData.customRoads) setCustomRoads(tickData.customRoads);
          if (tickData.carRoutes) {
            setCarRoutes(tickData.carRoutes);
          }

          // Build footprint trails and speed history
          if (tickData.footprints) {
            const newSpeeds: Record<string, number[]> = {};
            
            setTrails((prev) => {
              const newTrails = new Map(prev);
              for (const [carId, data] of Object.entries(tickData.footprints)) {
                const fpData = data as { trail: [number, number][]; speeds: number[]; color: string };
                newTrails.set(carId, fpData.trail);
                newSpeeds[carId] = fpData.speeds;
              }
              return newTrails;
            });
            
            setCarSpeeds(newSpeeds);
          }

          // Auto-stop côté client quand tout est terminé
          if (tickData.allTerminated || tickData.running === false) {
            const allDone = tickData.carsList?.every((c: CarInfo) => c.status === "terminé" || c.status === "arrivée" || c.status === "termine");
            if (allDone || tickData.allTerminated) {
              setRunning(false);
              runningRef.current = false;
              if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
              if (autoFlushRef.current) clearInterval(autoFlushRef.current);
              setLastFlushMsg("✅ Simulation terminée — tous les itinéraires sont terminés");
            }
          }
        }
      } catch {
        // ignore
      }
    }, config.recordIntervalSec * 1000);

    if (autoFlushRef.current) clearInterval(autoFlushRef.current);
    autoFlushRef.current = setInterval(async () => {
      if (!runningRef.current) return;
      try {
        const stateRes = await fetch("/api/simulation");
        const stateData = await stateRes.json();
        const bs = stateData.bufferStats;
        if (!bs) return;
        const c = configRef.current;
        if (bs.sizeKb >= c.flushThresholdKb || bs.elapsedMinutes >= c.flushThresholdMinutes) {
          const flushRes = await fetch("/api/simulation/flush", { method: "POST" });
          const flushData = await flushRes.json();
          if (flushData.ok) {
            setLastFlushMsg(
              `✅ Auto-flush ${flushData.flushed} enregistrements à ${new Date().toLocaleTimeString()}`
            );
            setTotalInDb(flushData.totalInDb ?? 0);
            setBufferStats({ totalRecords: 0, sizeKb: 0, elapsedMinutes: 0 });
          }
        }
      } catch {
        // ignore
      }
    }, 10000);
  }, [config]);

  const handleStop = useCallback(async () => {
    setRunning(false);
    setPaused(false);
    setPrepared(false);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    if (autoFlushRef.current) clearInterval(autoFlushRef.current);
    await fetch("/api/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
  }, []);

  const handleFlush = useCallback(async () => {
    try {
      const res = await fetch("/api/simulation/flush", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setLastFlushMsg(
          `✅ ${data.flushed} footprints sauvegardés à ${new Date().toLocaleTimeString()}`
        );
        setTotalInDb(data.totalInDb ?? 0);
        setBufferStats({ totalRecords: 0, sizeKb: 0, elapsedMinutes: 0 });
      } else {
        setLastFlushMsg(data.error ?? "Échec du flush");
      }
    } catch {
      setLastFlushMsg("❌ Erreur réseau");
    }
  }, []);

  const handleDownloadGeoJSON = useCallback((carId: string) => {
    window.open(`/api/simulation/geojson/${carId}`, "_blank");
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-800 via-green-700 to-teal-700 text-white px-6 py-3 shadow-lg flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-3xl">🇩🇿</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Système de Suivi de Flotte — Algérie
            </h1>
            <p className="text-xs text-green-200">
              Propriétaires · Conducteurs · Itinéraires · Footprints · Routes OSRM réelles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <div className="flex items-center gap-2 bg-green-400/30 text-green-100 px-3 py-1.5 rounded-full text-sm font-medium">
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
              EN DIRECT — {cars.length} véhicules
            </div>
          )}
          {paused && (
            <div className="flex items-center gap-2 bg-amber-400/30 text-amber-100 px-3 py-1.5 rounded-full text-sm font-medium">
              ⏸️ PAUSE
            </div>
          )}
          {initLoading && (
            <div className="flex items-center gap-2 text-yellow-200 text-sm animate-pulse">
              ⏳ Récupération des routes...
            </div>
          )}
          <button
            onClick={() => setDbViewerOpen(true)}
            className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
          >
            🗄️ Base de données
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 px-4 pt-2 flex-shrink-0">
        <button onClick={() => setActiveTab("carte")} className={`px-4 py-1.5 rounded-t-lg text-sm font-semibold ${activeTab==="carte" ? "bg-white shadow text-emerald-700 border" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>🗺️ Carte</button>
        <button onClick={() => setActiveTab("infractions")} className={`px-4 py-1.5 rounded-t-lg text-sm font-semibold flex items-center gap-2 ${activeTab==="infractions" ? "bg-white shadow text-red-700 border" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>🚨 Infractions {mapInfractions.length>0 && <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{mapInfractions.length}</span>}</button>
        <button onClick={() => setActiveTab("panneaux")} className={`px-4 py-1.5 rounded-t-lg text-sm font-semibold ${activeTab==="panneaux" ? "bg-white shadow text-amber-700 border" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>🛑 Panneaux</button>
        <button onClick={() => setActiveTab("unites")} className={`px-4 py-1.5 rounded-t-lg text-sm font-semibold flex items-center gap-2 ${activeTab==="unites" ? "bg-white shadow text-blue-800 border" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>🚓 Unités {unites.length>0 && <span className="bg-blue-700 text-white text-xs px-1.5 py-0.5 rounded-full">{unites.length}</span>}</button>
        <button onClick={() => setActiveTab("vehicules")} className={`px-4 py-1.5 rounded-t-lg text-sm font-semibold flex items-center gap-2 ${activeTab==="vehicules" ? "bg-white shadow text-emerald-800 border" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>🚙 Inscrites {vehiculesInscrits.length>0 && <span className="bg-emerald-700 text-white text-xs px-1.5 py-0.5 rounded-full">{vehiculesInscrits.length}</span>}</button>
      </div>

      {/* Main Content Area - garde MapView monté pour conserver footprints */}
      <div className={`flex-1 flex flex-col overflow-hidden p-4 pt-2 gap-4 ${activeTab!=="carte" ? "hidden" : ""}`}>
        
        {/* Top Stats Banner */}
        <StatsDashboard cars={cars} />

        <div className="flex-1 flex overflow-hidden gap-4">
          {/* Left Sidebar - Controls */}
          <aside className="w-80 flex-shrink-0 overflow-y-auto space-y-4">
          <ControlPanel
            config={config}
            onConfigChange={setConfig}
            onPrepare={handlePrepare}
            onGo={handleGo}
            onStop={handleStop}
            onFlush={handleFlush}
            running={running}
            prepared={prepared}
            sessionId={sessionId}
            bufferStats={bufferStats}
            totalInDb={totalInDb}
            lastFlushMsg={lastFlushMsg}
          />
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <div className="absolute top-2 right-2 z-[1000] bg-white/95 border shadow rounded-lg px-2.5 py-1.5 text-xs font-medium flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showTrails} onChange={e=>setShowTrails(e.target.checked)} />
              🧭 Footprints
            </label>
          </div>
          {selectingItineraryFor && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-sky-600 text-white text-xs px-3 py-1.5 rounded-full shadow">
              {pendingItinerary?.origin ? `📍 Clique l'arrivée pour ${selectingItineraryFor}` : `📍 Clique le départ pour ${selectingItineraryFor} — ou Annuler`}
              <button onClick={()=>{ setSelectingItineraryFor(null); setPendingItinerary(null);}} className="ml-2 bg-white/20 px-2 py-0.5 rounded">Annuler</button>
            </div>
          )}
          <MapView
            geojson={geojson}
            selectedCar={selectedCar}
            onSelectCar={setSelectedCar}
            trails={trails}
            carRoutes={carRoutes}
            carSpeeds={carSpeeds}
            customRoads={null}
            onMapClick={handleMapClick}
            showTrails={showTrails}
          />
        </main>

        {/* Right Sidebar - Car List + Export */}
        <aside className="w-96 flex-shrink-0 overflow-y-auto space-y-4">
          <CarList
            cars={cars}
            selectedCar={selectedCar}
            onSelectCar={setSelectedCar}
            onDownloadGeoJSON={handleDownloadGeoJSON}
          />
          <ExportPanel hasSimulation={cars.length > 0} selectedWilayas={config.selectedWilayas} routesCount={Object.keys(carRoutes).length} />
        </aside>
      </div>
      </div>
      <div className={`flex-1 overflow-auto p-4 ${activeTab!=="infractions" ? "hidden" : ""}`}>
        <InfractionsList
          onSelectCar={(carId)=> { setSelectedCar(carId); setActiveTab("carte"); }}
          onDisplayChange={setMapInfractions}
        />
      </div>
      <div className={`flex-1 overflow-auto p-4 space-y-4 ${activeTab!=="panneaux" ? "hidden" : ""}`}>
        <div className="bg-white rounded-xl shadow p-4 border">
          <h3 className="font-bold text-sm mb-2">🛑 Panneaux de signalisation</h3>
          <p className="text-xs text-gray-500 mb-3">Uploadez un GeoJSON avec des <code>Point highway=stop</code> (stop), <code>place=*</code> ou <code>indication</code> (villes). Parcourir ci-dessous.</p>
          <div className="flex gap-2 mb-3">
            <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-amber-300 rounded-lg cursor-pointer hover:bg-amber-50">
              <span>📁</span><span className="text-xs font-medium">Charger GeoJSON panneaux</span>
              <input type="file" accept=".geojson,.json" className="hidden" onChange={async e=>{
                const file=e.target.files?.[0]; if(!file) return;
                const text=await file.text(); const gj=JSON.parse(text);
                const res=await fetch("/api/simulation/upload-roads",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(gj)});
                const data=await res.json();
                if(data.ok){ setLastFlushMsg(`✅ ${data.segments} panneaux chargés`); fetch("/api/simulation/stops").then(r=>r.json()).then(d=> setPanneaux(d.features||[])); }
                else setLastFlushMsg(data.error||"Erreur");
              }} />
            </label>
            <a href="/api/simulation/stops" target="_blank" className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded flex items-center">⬇️ Télécharger</a>
          </div>
          <div className="text-[11px] text-gray-400">Route: <code>/api/simulation/stops</code> — {panneaux.length} panneaux</div>
        </div>
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="px-4 py-2 bg-amber-50 border-b flex items-center justify-between">
            <h4 className="font-bold text-sm">📋 GeoJSON des panneaux — {panneaux.length} entités</h4>
            <span className="text-xs bg-white border px-2 py-0.5 rounded">{panneaux.filter((f:any)=>f.properties?.highway==="stop").length} stop • {panneaux.filter((f:any)=>f.properties?.place || f.properties?.indication).length} indications</span>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500"><th className="px-3 py-1.5">Type</th><th className="px-3 py-1.5">Nom</th><th className="px-3 py-1.5">Position</th><th className="px-3 py-1.5">Propriétés</th></tr>
              </thead>
              <tbody>
                {panneaux.length===0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Aucun panneau chargé — uploadez un GeoJSON</td></tr>
                ) : panneaux.map((f:any,i:number)=>(
                  <tr key={i} className="border-t hover:bg-amber-50">
                    <td className="px-3 py-1"><span className="px-1.5 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800">{f.properties?.highway==="stop" ? "STOP" : f.properties?.place ? "Ville" : "Panneau"}</span></td>
                    <td className="px-3 py-1">{f.properties?.name || f.properties?.indication || "—"}</td>
                    <td className="px-3 py-1 font-mono text-[11px]">{f.geometry?.coordinates?.[1]?.toFixed(4)}, {f.geometry?.coordinates?.[0]?.toFixed(4)}</td>
                    <td className="px-3 py-1 font-mono text-[10px] max-w-[260px] truncate" title={JSON.stringify(f.properties)}>{Object.entries(f.properties||{}).map(([k,v])=>`${k}:${v}`).join(" | ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-auto p-4 space-y-4 ${activeTab!=="unites" ? "hidden" : ""}`}>
        <div className="bg-white rounded-xl shadow p-4 border">
          <h3 className="font-bold text-sm mb-2">🚓 Forces de sécurité — chargement GeoJSON</h3>
          <p className="text-xs text-gray-500 mb-3">Uploadez un <code>FeatureCollection</code> de <code>Point [lon,lat]</code> : <code>code, nom, type (police|gendarmerie), moyen (barrage_fixe|barrage_mobile|motards|vehicule_mobile|poste_fixe), codeWilaya, wilaya, telephone</code>. Les unités sont positionnées sur les routes et visibles dans l’app unités.</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={async ()=>{ await fetch("/api/unites").then(r=>r.json()).then(d=> setUnites(d.unites || [])); setLastFlushMsg(`🔄 Unités rechargées depuis la base (${unites.length})`); }} className="text-xs bg-white border px-3 py-1.5 rounded hover:bg-blue-50">🔄 Recharger depuis la base</button>
            <label className="flex-1 min-w-[220px] flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50">
              <span>📁</span><span className="text-xs font-medium">Charger GeoJSON unités</span>
              <input type="file" accept=".geojson,.json" className="hidden" onChange={async e=>{
                const file=e.target.files?.[0]; if(!file) return;
                try {
                  const text=await file.text(); const gj=JSON.parse(text);
                  const res=await fetch("/api/unites/upload",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(gj)});
                  const data=await res.json();
                  if(data.ok){ setLastFlushMsg(`✅ Unités : ${data.inserted} ajoutées, ${data.updated} mises à jour (${data.received} reçues)`); fetch("/api/unites").then(r=>r.json()).then(d=> setUnites(d.unites||[])); }
                  else setLastFlushMsg(data.error||"Erreur");
                } catch { setLastFlushMsg("❌ GeoJSON illisible"); }
                e.target.value="";
              }} />
            </label>
            <a href="/api/unites/geojson" target="_blank" className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded flex items-center">⬇️ Télécharger GeoJSON</a>
            <a href="/security-units-app/index.html" target="_blank" className="text-xs bg-white border px-3 py-1.5 rounded flex items-center hover:bg-blue-50">📱 App unités</a>
          </div>
          <div className="text-[11px] text-gray-400">Route: <code>/api/unites/geojson</code> — {unites.length} unités</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border">
          <h3 className="font-bold text-sm mb-2">👤 Comptes des unités — {comptes.length}</h3>
          <p className="text-xs text-gray-500 mb-3">Un compte = une unité = son territoire (wilaya imposée côté serveur). Le compte sert à se connecter dans l’app Android.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
            <select value={cWilaya} onChange={e=>{setCWilaya(e.target.value); setCUnite("");}} className="text-xs border rounded px-2 py-1.5">
              <option value="">Wilaya…</option>
              {[...new Map(unites.map((f:any)=>[f.codeWilaya, f.wilaya])).entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([c,n]:any)=><option key={c} value={c}>{c} - {n}</option>)}
            </select>
            <select value={cCorps} onChange={e=>{setCCorps(e.target.value); setCUnite("");}} className="text-xs border rounded px-2 py-1.5">
              <option value="">Corps…</option>
              <option value="police">🚓 Police</option>
              <option value="gendarmerie">🪖 Gendarmerie</option>
            </select>
            <select value={cMoyen} onChange={e=>{setCMoyen(e.target.value); setCUnite("");}} className="text-xs border rounded px-2 py-1.5">
              <option value="">Dispositif…</option>
              <option value="barrage_fixe">🚧 Barrage fixe</option>
              <option value="barrage_mobile">🚔 Barrage mobile</option>
              <option value="motards">🏍️ Motards</option>
              <option value="vehicule_mobile">🚙 Véhicule mobile</option>
              <option value="poste_fixe">🏢 Poste fixe</option>
            </select>
            <select value={cUnite} onChange={e=>setCUnite(e.target.value)} className="text-xs border rounded px-2 py-1.5">
              <option value="">Unité…</option>
              {unites.filter((f:any)=>(!cWilaya||f.codeWilaya===cWilaya)&&(!cCorps||f.type===cCorps)&&(!cMoyen||f.moyen===cMoyen)).slice(0,200).map((f:any)=><option key={f.code} value={f.code}>{f.code} — {f.nom}</option>)}
            </select>
            <input value={cUser} onChange={e=>setCUser(e.target.value)} placeholder="Nom d'utilisateur" className="text-xs border rounded px-2 py-1.5" />
            <input value={cPass} onChange={e=>setCPass(e.target.value)} placeholder="Mot de passe (6+)" type="password" className="text-xs border rounded px-2 py-1.5" />
          </div>
          <button onClick={async ()=>{
            setCMsg("");
            if(!cUnite||!cUser||cPass.length<6){ setCMsg("⚠️ Choisis une unité (Wilaya → Corps → Dispositif → Unité) + utilisateur + mot de passe (6+)."); return; }
            setCMsg("⏳ Création en cours…");
            try {
              const res=await fetch("/api/unites/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:cUser,password:cPass,uniteCode:cUnite})});
              const data=await res.json();
              if(data.ok){ setCMsg(`✅ Compte ${data.username} créé pour ${data.unite?.code} — connecte-toi avec dans l'app Android.`); setLastFlushMsg(`✅ Compte ${data.username} créé pour ${data.unite?.code}`); setCUser(""); setCPass(""); fetch("/api/unites/comptes").then(r=>r.json()).then(d=> setComptes(d.comptes||[])); }
              else setCMsg("❌ "+(data.error||"Erreur"));
            } catch { setCMsg("❌ Serveur injoignable — vérifie que la plateforme tourne."); }
          }} className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded font-semibold">➕ Créer le compte</button>
          {cMsg && <div className="text-xs mt-2 px-3 py-1.5 rounded bg-blue-50 border border-blue-200">{cMsg}</div>}
          <div className="max-h-[30vh] overflow-auto mt-3 border rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500"><th className="px-3 py-1.5">Utilisateur</th><th className="px-3 py-1.5">Unité</th><th className="px-3 py-1.5">Territoire</th><th className="px-3 py-1.5">Statut</th><th className="px-3 py-1.5">Actions</th></tr>
              </thead>
              <tbody>
                {comptes.length===0 ? (
                  <tr><td colSpan={5} className="text-center py-6 text-gray-400">Aucun compte — créez le premier ci-dessus</td></tr>
                ) : comptes.map((c:any)=>(
                  <tr key={c.id} className="border-t hover:bg-blue-50">
                    <td className="px-3 py-1 font-mono font-semibold">{c.username}</td>
                    <td className="px-3 py-1">{c.unite?.code} — {c.unite?.nom}</td>
                    <td className="px-3 py-1">{c.unite?.codeWilaya} - {c.unite?.wilaya}</td>
                    <td className="px-3 py-1">{c.actif ? <span className="px-1.5 py-0.5 rounded text-[11px] bg-green-100 text-green-800">actif</span> : <span className="px-1.5 py-0.5 rounded text-[11px] bg-gray-200 text-gray-600">désactivé</span>}</td>
                    <td className="px-3 py-1 flex gap-1 flex-wrap">
                      <button onClick={async ()=>{ await fetch("/api/unites/comptes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:c.id,actif:!c.actif})}); fetch("/api/unites/comptes").then(r=>r.json()).then(d=> setComptes(d.comptes||[])); }} className="text-[11px] bg-white border px-2 py-0.5 rounded hover:bg-gray-50">{c.actif ? "⏸️ Désactiver" : "▶️ Activer"}</button>
                      <button onClick={async ()=>{ const np=window.prompt(`Nouveau mot de passe pour ${c.username} (6+) :`); if(!np) return; const r=await fetch("/api/unites/comptes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:c.id,password:np})}); const d=await r.json(); setLastFlushMsg(d.ok?`✅ Mot de passe réinitialisé pour ${c.username}`:(d.error||"Erreur")); }} className="text-[11px] bg-white border px-2 py-0.5 rounded hover:bg-gray-50">🔑 MDP</button>
                      <button onClick={async ()=>{ if(!window.confirm(`Supprimer le compte ${c.username} ?`)) return; await fetch(`/api/unites/comptes?id=${c.id}`,{method:"DELETE"}); fetch("/api/unites/comptes").then(r=>r.json()).then(d=> setComptes(d.comptes||[])); }} className="text-[11px] bg-white border px-2 py-0.5 rounded hover:bg-red-50 text-red-600">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="px-4 py-2 bg-blue-50 border-b flex items-center justify-between">
            <h4 className="font-bold text-sm">📋 Unités (base) — {unites.length}</h4>
            <span className="text-xs bg-white border px-2 py-0.5 rounded">{unites.filter((f:any)=>f.type==="police").length} police • {unites.filter((f:any)=>f.type==="gendarmerie").length} gendarmerie</span>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500"><th className="px-3 py-1.5">Code</th><th className="px-3 py-1.5">Nom</th><th className="px-3 py-1.5">Corps</th><th className="px-3 py-1.5">Dispositif</th><th className="px-3 py-1.5">Wilaya</th><th className="px-3 py-1.5">Position</th><th className="px-3 py-1.5">Tél</th></tr>
              </thead>
              <tbody>
                {unites.length===0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucune unité — uploadez un GeoJSON ou actualisez</td></tr>
                ) : unites.map((f:any)=>(
                  <tr key={f.id || f.code} className="border-t hover:bg-blue-50">
                    <td className="px-3 py-1 font-mono">{f.code}</td>
                    <td className="px-3 py-1">{f.nom}</td>
                    <td className="px-3 py-1">{f.type==="police" ? "🚓 Police" : "🪖 Gendarmerie"}</td>
                    <td className="px-3 py-1">{f.moyen}</td>
                    <td className="px-3 py-1">{f.codeWilaya} - {f.wilaya}</td>
                    <td className="px-3 py-1 font-mono text-[11px]">{f.latitude?.toFixed(4)}, {f.longitude?.toFixed(4)}</td>
                    <td className="px-3 py-1">{f.telephone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-auto p-4 space-y-4 ${activeTab!=="vehicules" ? "hidden" : ""}`}>
        <div className="bg-white rounded-xl shadow p-4 border">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="font-bold text-sm">🚙 Véhicules inscrites — {vehiculesInscrits.length}</h3>
            <div className="flex gap-2">
              <input value={searchVeh} onChange={e=>setSearchVeh(e.target.value)} placeholder="🔍 Immat, propriétaire, chauffeur…" autoComplete="off" name="veh-search" spellCheck={false} readOnly={searchVehRO} onFocus={()=>setSearchVehRO(false)} onBlur={()=>setSearchVehRO(true)} className="text-xs border rounded px-2 py-1.5 w-64" />
              <button onClick={()=>fetch("/api/admin/vehicules-inscrits").then(r=>r.json()).then(d=> setVehiculesInscrits(d.vehicules||[]))} className="text-xs bg-white border px-3 py-1.5 rounded hover:bg-emerald-50">🔄</button>
              <a href="/proprietaires-app/index.html" target="_blank" className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded flex items-center">📝 Espace propriétaires</a>
            </div>
          </div>
          <p className="text-xs text-gray-500">Registre des propriétaires inscrits (avec compte) : ces véhicules et chauffeurs sont utilisés par la simulation en mode « Registre ».</p>
        </div>
        <div className="bg-white rounded-xl shadow border overflow-hidden">
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-gray-500"><th className="px-3 py-1.5">Immatriculation</th><th className="px-3 py-1.5">Véhicule</th><th className="px-3 py-1.5">Catégorie</th><th className="px-3 py-1.5">Propriétaire</th><th className="px-3 py-1.5">Tél</th><th className="px-3 py-1.5">Wilaya</th><th className="px-3 py-1.5">Chauffeur désigné</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const q = searchVeh.trim().toLowerCase();
                  const list = vehiculesInscrits.filter((v:any)=> !q || (v.immatriculation||"").toLowerCase().includes(q) || (v.proprietaire||"").toLowerCase().includes(q) || (v.chauffeur||"").toLowerCase().includes(q) || (v.carId||"").toLowerCase().includes(q));
                  if (!list.length) return (<tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun véhicule inscrit — les propriétaires s’inscrivent via l’Espace propriétaires</td></tr>);
                  return list.map((v:any)=>(
                    <tr key={v.id} className="border-t hover:bg-emerald-50">
                      <td className="px-3 py-1 font-mono font-semibold">{v.immatriculation} <span className="text-gray-400 font-normal">({v.carId})</span></td>
                      <td className="px-3 py-1">{v.marque} {v.modele} {v.couleur && `(${v.couleur})`}</td>
                      <td className="px-3 py-1">{v.categorieVehicule}</td>
                      <td className="px-3 py-1">{v.proprietaire}</td>
                      <td className="px-3 py-1">{v.proprietaireTel}</td>
                      <td className="px-3 py-1">{v.codeWilaya} - {v.wilaya}</td>
                      <td className="px-3 py-1">{v.chauffeur ? <>🧑‍✈️ {v.chauffeur} <span className="text-gray-400">({v.chauffeurTel})</span></> : <span className="text-red-500">non désigné</span>}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* DB Viewer Modal */}
      <DbViewer isOpen={dbViewerOpen} onClose={() => setDbViewerOpen(false)} />
    </div>
  );
}
