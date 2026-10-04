"use client";

import { useState } from "react";
import { WILAYAS } from "@/lib/algeriaData";

interface SimConfig {
  numCars: number;
  recordIntervalSec: number;
  timeMultiplier: number;
  flushThresholdKb: number;
  flushThresholdMinutes: number;
  selectedWilayas: string[];
  vehicleCategories?: string[];
  sourceDonnees?: "aleatoire" | "registre";
  simulateContresens?: boolean;
  maxContinuousDrivingHours?: number;
  customOrigin?: string | null;
  customDestination?: string | null;
}

interface Props {
  config: any;
  onConfigChange: (config: any) => void;
  onPrepare: () => void;
  onGo: () => void;
  onStop: () => void;
  onFlush: () => void;
  running: boolean;
  prepared: boolean;
  sessionId: string | null;
  bufferStats: { totalRecords: number; sizeKb: number; elapsedMinutes: number };
  totalInDb: number;
  lastFlushMsg: string;
}

export default function ControlPanel({
  config,
  onConfigChange,
  onPrepare,
  onGo,
  onStop,
  onFlush,
  running,
  prepared,
  sessionId,
  bufferStats,
  totalInDb,
  lastFlushMsg,
}: Props) {
  const [localConfig, setLocalConfig] = useState<SimConfig>(config);

  const update = (key: keyof SimConfig, value: number) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const updateWilayas = (codes: string[]) => {
    const newConfig = { ...localConfig, selectedWilayas: codes };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const shouldAutoFlush =
    bufferStats.sizeKb >= localConfig.flushThresholdKb ||
    bufferStats.elapsedMinutes >= localConfig.flushThresholdMinutes;

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 space-y-4 border border-gray-100">
      <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
        ⚙️ Simulation Controls
      </h2>

      {/* Region info */}
      <div className="bg-emerald-50 rounded-lg p-3 text-sm border border-emerald-100">
        <div className="font-semibold text-emerald-800 flex items-center gap-1">
          🇩🇿 Northern Algeria
        </div>
        <div className="text-emerald-600 text-xs mt-1">
          Cars route between 37 real cities using OSRM road routing
          (Algiers, Oran, Constantine, Annaba, Tlemcen, Setif...)
        </div>
      </div>

      {/* Wilayas Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          📍 Filtrer par Wilayas :
        </label>
        <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto border rounded-lg p-2 bg-gray-50 text-[10px]">
          {WILAYAS.map((w) => (
            <label key={w.code} className="flex items-center gap-1 hover:bg-white p-0.5 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig.selectedWilayas.includes(w.code)}
                onChange={(e) => {
                  const newWilayas = e.target.checked
                    ? [...localConfig.selectedWilayas, w.code]
                    : localConfig.selectedWilayas.filter((c) => c !== w.code);
                  updateWilayas(newWilayas);
                }}
                disabled={running}
              />
              <span className="truncate">{w.code} - {w.name}</span>
            </label>
          ))}
        </div>
        <p className="text-[9px] text-gray-400 mt-1">Si rien n&apos;est coché, toutes les wilayas du nord sont utilisées.</p>
      </div>

      {/* Vehicle Categories */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          🚛 Types de véhicules :
        </label>
        <div className="grid grid-cols-2 gap-1 border rounded-lg p-2 bg-gray-50 text-[10px]">
          {[
            { id: "leger", label: "Léger" },
            { id: "lourd", label: "Lourd" },
            { id: "transport", label: "Transport" },
            { id: "transport_dangereux", label: "Dangereux" },
            { id: "convoi_exceptionnel", label: "Convoi Exc." },
            { id: "transport_personnel", label: "Personnel" },
          ].map((cat) => (
            <label key={cat.id} className="flex items-center gap-1 hover:bg-white p-0.5 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={!localConfig.vehicleCategories || localConfig.vehicleCategories.includes(cat.id)}
                onChange={(e) => {
                  const current = localConfig.vehicleCategories || ["leger","lourd","transport","transport_dangereux","convoi_exceptionnel","transport_personnel"];
                  const next = e.target.checked ? [...current, cat.id] : current.filter(c => c !== cat.id);
                  const nc = { ...localConfig, vehicleCategories: next.length ? next : ["leger"] };
                  setLocalConfig(nc); onConfigChange(nc);
                }}
                disabled={running}
              />
              <span className="truncate">{cat.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Source des données : aléatoire ou vrais inscrits */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          🧑‍🤝‍🧑 Véhicules simulés :
        </label>
        <select value={localConfig.sourceDonnees || "aleatoire"} onChange={e=>{ const nc={...localConfig, sourceDonnees:e.target.value as any}; setLocalConfig(nc); onConfigChange(nc); }} disabled={running} className="w-full px-2 py-1.5 text-sm border rounded-lg bg-white">
          <option value="aleatoire">🎲 Aléatoires (noms générés)</option>
          <option value="registre">📋 Inscrits (registre propriétaires)</option>
        </select>
        <p className="text-[10px] text-gray-400 mt-1">Registre = vrais propriétaires, véhicules et chauffeurs désignés.</p>
      </div>

      {/* Contresens simulation */}
      <div className="flex items-center gap-2 border rounded-lg p-2 bg-amber-50">
        <input type="checkbox" checked={!!localConfig.simulateContresens} onChange={e=>{ const nc={...localConfig, simulateContresens:e.target.checked}; setLocalConfig(nc); onConfigChange(nc);}} disabled={running} />
        <span className="text-xs font-medium text-amber-800">Simuler contresens (15% des voitures)</span>
      </div>

      {/* Conduite longue sans arrêt */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">⏱️ Conduite continue max (heures) — infraction au-delà</label>
        <input type="number" min={1} max={12} step={0.5} value={localConfig.maxContinuousDrivingHours ?? 4} onChange={e=>{ const v=parseFloat(e.target.value)||4; const nc={...localConfig, maxContinuousDrivingHours:v}; setLocalConfig(nc); onConfigChange(nc);}} disabled={running} className="w-full px-2 py-1.5 text-sm border rounded-lg" />
        <p className="text-[10px] text-gray-400 mt-1">Ex: 4h → infraction si &gt;4h sans arrêt</p>
      </div>

      {/* Number of Cars */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          🚗 Number of Cars: <span className="font-bold text-blue-600">{localConfig.numCars}</span>
        </label>
        <input
          type="range"
          min={1}
          max={50}
          value={localConfig.numCars}
          onChange={(e) => update("numCars", parseInt(e.target.value))}
          disabled={running}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>1</span>
          <span>25</span>
          <span>50</span>
        </div>
      </div>

      {/* Record Interval */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ⏱️ Record Interval:{" "}
          <span className="font-bold text-green-600">{localConfig.recordIntervalSec}s</span>
        </label>
        <input
          type="range"
          min={1}
          max={30}
          value={localConfig.recordIntervalSec}
          onChange={(e) => update("recordIntervalSec", parseInt(e.target.value))}
          disabled={running}
          className="w-full accent-green-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>1s</span>
          <span>15s</span>
          <span>30s</span>
        </div>
      </div>

      {/* Simulation Speed (Time Multiplier) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ⚡ Simulation Speed:{" "}
          <span className="font-bold text-orange-600">{localConfig.timeMultiplier}x</span>
        </label>
        <input
          type="range"
          min={1}
          max={60}
          step={1}
          value={localConfig.timeMultiplier}
          onChange={(e) => update("timeMultiplier", parseInt(e.target.value))}
          disabled={running}
          className="w-full accent-orange-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>1x (Réel)</span>
          <span>30x</span>
          <span>60x</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Accélère le temps simulé. 60x = 1 sec réelle est 1 min simulée.
        </p>
      </div>

      {/* Flush Thresholds */}
      <div className="border-t pt-3 mt-3">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          📤 Auto-Flush to Database
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Max Size (KB)
            </label>
            <input
              type="number"
              min={10}
              max={5000}
              value={localConfig.flushThresholdKb}
              onChange={(e) => update("flushThresholdKb", parseInt(e.target.value) || 50)}
              className="w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Max Time (min)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={localConfig.flushThresholdMinutes}
              onChange={(e) =>
                update("flushThresholdMinutes", parseInt(e.target.value) || 2)
              }
              className="w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          When buffer exceeds either threshold, data auto-flushes to PostgreSQL
        </p>
      </div>

      {/* Action Buttons - Préparer puis GO */}
      <div className="flex gap-2 pt-2">
        {!prepared && !running ? (
          <button
            onClick={onPrepare}
            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            🛠️ Préparer
          </button>
        ) : prepared && !running ? (
          <>
            <button
              onClick={onGo}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95 animate-pulse"
            >
              🚀 GO
            </button>
            <button
              onClick={onStop}
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              ⏹️ Annuler
            </button>
          </>
        ) : (
          <button
            onClick={onStop}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            ⏹️ Stop
          </button>
        )}
        <button
          onClick={onFlush}
          className={`flex-1 font-semibold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95 ${
            shouldAutoFlush
              ? "bg-orange-500 hover:bg-orange-600 text-white animate-pulse"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          📤 Flush DB
        </button>
      </div>
      {prepared && !running && (
        <div className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 font-medium">
          ✅ Voitures prêtes — fixez les croquis ✏️ Vitesse par voiture puis GO
        </div>
      )}

      {/* Buffer Stats */}
      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5 border">
        <div className="font-semibold text-gray-700 mb-1">📊 Buffer Status</div>
        <div className="flex justify-between">
          <span className="text-gray-500">Records buffered:</span>
          <span className="font-mono font-bold">{bufferStats.totalRecords}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Buffer size:</span>
          <span
            className={`font-mono font-bold ${
              bufferStats.sizeKb >= localConfig.flushThresholdKb
                ? "text-red-600"
                : ""
            }`}
          >
            {bufferStats.sizeKb} KB
            <span className="text-gray-400 font-normal">
              {" "}
              / {localConfig.flushThresholdKb} KB
            </span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Time since flush:</span>
          <span
            className={`font-mono font-bold ${
              bufferStats.elapsedMinutes >= localConfig.flushThresholdMinutes
                ? "text-red-600"
                : ""
            }`}
          >
            {bufferStats.elapsedMinutes} min
            <span className="text-gray-400 font-normal">
              {" "}
              / {localConfig.flushThresholdMinutes} min
            </span>
          </span>
        </div>

        {/* Progress bars */}
        <div className="space-y-1 mt-2">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (bufferStats.sizeKb / localConfig.flushThresholdKb) * 100)}%`,
              }}
            />
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (bufferStats.elapsedMinutes / localConfig.flushThresholdMinutes) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="flex justify-between pt-1 border-t mt-2">
          <span className="text-gray-500">Total saved to DB:</span>
          <span className="font-mono font-bold text-green-600">{totalInDb}</span>
        </div>

        {sessionId && (
          <div className="flex justify-between">
            <span className="text-gray-500">Session:</span>
            <span className="font-mono text-xs text-gray-400">
              {sessionId.slice(0, 12)}...
            </span>
          </div>
        )}

        {lastFlushMsg && (
          <div className="text-xs text-blue-600 mt-1 font-medium bg-blue-50 rounded px-2 py-1">
            {lastFlushMsg}
          </div>
        )}

        {shouldAutoFlush && running && (
          <div className="text-xs text-orange-600 mt-1 font-bold animate-pulse bg-orange-50 rounded px-2 py-1">
            ⚠️ Threshold reached — auto-flushing...
          </div>
        )}
      </div>
    </div>
  );
}
