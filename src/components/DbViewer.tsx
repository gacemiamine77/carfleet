"use client";

import { useState, useEffect, useCallback } from "react";

interface TrackingRow {
  id: number;
  carId: string;
  driverName: string;
  driverPhone: string;
  latitude: number;
  longitude: number;
  speed: number;
  acceleration: number;
  heading: number;
  altitude: number;
  recordedAt: string;
  distanceTraveled: number;
  status: string;
  sessionId: string;
}

interface SessionRow {
  id: number;
  sessionId: string;
  numVoitures?: number;
  numCars?: number;
  intervalleEnregistrement?: number;
  totalEnregistrements?: number;
  totalRecords?: number;
  createdAt: string;
}

export default function DbViewer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [records, setRecords] = useState<TrackingRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterCar, setFilterCar] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filterCar) params.set("carId", filterCar);
      const res = await fetch(`/api/tracking?${params}`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [page, filterCar]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  const handleExport = async (format: "geojson" | "shapefile") => {
    setExporting(format);
    setExportError(null);

    try {
      const url = `/api/tracking/export?format=${format}${filterCar ? `&carId=${encodeURIComponent(filterCar)}` : ""}`;
      const res = await fetch(url);

      if (!res.ok) {
        let errorMsg = "Échec de l'exportation.";
        try {
          const text = await res.text();
          if (text.startsWith("{")) {
            const json = JSON.parse(text);
            errorMsg = json.error || json.details || errorMsg;
          } else {
            errorMsg = "Base vide ou table manquante dans PostgreSQL.";
          }
        } catch {
          // ignore
        }
        setExportError(errorMsg);
        setExporting(null);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;

      // Extract filename from header or use default
      const contentDisposition = res.headers.get("content-disposition");
      let filename = `export-database.${format === "geojson" ? "geojson" : "zip"}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      
      // Feedback utilisateur
      console.log("Download started: " + filename);
    } catch (err: any) {
      console.error("Export error:", err);
      const msg = err.message || "Erreur de connexion lors de l'exportation.";
      setExportError(msg);
      alert("Erreur d'exportation: " + msg);
    } finally {
      setExporting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between bg-gradient-to-r from-emerald-800 via-green-700 to-teal-700 text-white">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              🗄️ Base de données PostgreSQL
            </h2>
            <p className="text-xs text-green-200 mt-0.5">
              {total} enregistrements de footprints au total • {sessions.length} sessions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition">
              🔄 Actualiser
            </button>
            <button onClick={onClose} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition">
              ✕ Fermer
            </button>
          </div>
        </div>

        {/* Filter & Export Bar */}
        <div className="p-3 bg-gray-50 border-b flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              placeholder="Filtrer par Car ID (ex: CAR-001)"
              autoComplete="off"
              name="db-filter-car"
              spellCheck={false}
              value={filterCar}
              onChange={(e) => {
                setFilterCar(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 border rounded-lg text-sm flex-1 focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase mr-1">Exporter base :</span>
            <button
              onClick={() => handleExport("geojson")}
              disabled={exporting !== null}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5"
            >
              <span>{exporting === "geojson" ? "⏳" : "🌍"}</span>
              <span>{exporting === "geojson" ? "Exportation..." : "GeoJSON"}</span>
            </button>
            <button
              onClick={() => handleExport("shapefile")}
              disabled={exporting !== null}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5"
            >
              <span>{exporting === "shapefile" ? "⏳" : "📦"}</span>
              <span>{exporting === "shapefile" ? "Génération..." : "Shapefile (ZIP)"}</span>
            </button>
          </div>

          <div className="h-6 w-px bg-gray-300 hidden md:block mx-1" />

          {/* Reset Database Button */}
          <button
            onClick={async () => {
              if (!confirm("⚠️ ATTENTION !\n\nCela va SUPPRIMER DÉFINITIVEMENT tous les enregistrements de la base de données (footprints, itinéraires, véhicules, conducteurs).\n\nCette action est irréversible.\n\nÊtes-vous sûr de vouloir continuer ?")) {
                return;
              }
              
              try {
                const res = await fetch("/api/tracking/reset", { method: "POST" });
                const data = await res.json();
                
                if (data.ok) {
                  alert("✅ Base de données réinitialisée avec succès !");
                  fetchData(); // Refresh the view
                } else {
                  alert("❌ Erreur : " + (data.error || "Échec de la réinitialisation"));
                }
              } catch (err: any) {
                alert("❌ Erreur réseau : " + err.message);
              }
            }}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1"
            title="Vider complètement la base de données"
          >
            🗑️ Vider la Base
          </button>

          {/* Pagination */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Page {page} / {Math.max(1, Math.ceil(total / 50))}</span>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-40 text-xs font-bold"
            >
              ◀
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(total / 50)}
              className="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-40 text-xs font-bold"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Error notification banner */}
        {exportError && (
          <div className="p-3 bg-red-100 border-b border-red-200 text-red-800 text-xs flex justify-between items-center">
            <span>⚠️ <b>Erreur d&apos;exportation :</b> {exportError}</span>
            <button onClick={() => setExportError(null)} className="font-bold text-red-600 ml-2">✕</button>
          </div>
        )}

        {/* Sessions overview */}
        {sessions.length > 0 && (
          <div className="p-3 bg-green-50 border-b">
            <h3 className="text-xs font-semibold text-green-900 mb-1">📋 Sessions récentes</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sessions.map((s) => (
                <div key={s.id} className="bg-white rounded-lg px-3 py-1 text-xs border border-green-200 shadow-sm flex-shrink-0 flex items-center gap-2">
                  <span className="font-mono text-green-700 font-bold">{s.sessionId.slice(0, 8)}</span>
                  <span className="text-gray-300">|</span>
                  <span>{s.numVoitures ?? s.numCars ?? 0} véhicules</span>
                  <span className="text-gray-300">|</span>
                  <span className="font-bold text-emerald-800">{s.totalEnregistrements ?? s.totalRecords ?? 0} footprints</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              Chargement des données...
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <span className="text-3xl">🗃️</span>
              <p>Aucun enregistrement trouvé en base de données.</p>
              <p className="text-xs text-gray-400">Lancez la simulation et cliquez sur <b>"Flush DB"</b> pour enregistrer des footprints.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Car ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Conducteur</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Téléphone</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Lat</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Lon</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Vitesse</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Accel</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Cap</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Statut</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Enregistré à</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-1.5 font-mono font-bold text-green-700">{r.carId || "N/A"}</td>
                    <td className="px-3 py-1.5 font-medium">{r.driverName || "N/A"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{r.driverPhone || "N/A"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.latitude?.toFixed(5)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.longitude?.toFixed(5)}</td>
                    <td className="px-3 py-1.5 font-mono font-semibold">{r.speed} km/h</td>
                    <td className={`px-3 py-1.5 font-mono text-xs ${r.acceleration > 0 ? 'text-green-600' : r.acceleration < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {r.acceleration > 0 ? '+' : ''}{r.acceleration}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{r.heading}°</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                          r.status === "moving"
                            ? "bg-green-100 text-green-800"
                            : r.status === "stopped"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-500 font-mono">
                      {r.recordedAt ? new Date(r.recordedAt).toLocaleTimeString() : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
