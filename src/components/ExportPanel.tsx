"use client";

import { useState } from "react";

interface Props {
  hasSimulation: boolean;
  selectedWilayas?: string[];
  routesCount?: number;
}

export default function ExportPanel({ hasSimulation, selectedWilayas = [], routesCount = 0 }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (format: string, label: string) => {
    setDownloading(format);
    try {
      const url = `/api/simulation/export-roads?format=${format}`;
      const link = document.createElement("a");
      link.href = url;
      link.click();
    } catch (error) {
      console.error("Download failed:", error);
    }
    setTimeout(() => setDownloading(null), 1000);
  };

  if (!hasSimulation) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 border border-gray-100">
      <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">📥 Exporter</h3>
      <button
        onClick={() => handleDownload("geojson", "GeoJSON")}
        disabled={downloading !== null || (!!hasSimulation && routesCount === 0)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-all disabled:opacity-50 mb-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🌍</span>
          <div className="text-left">
            <div className="font-semibold text-green-800 text-sm">GeoJSON</div>
            <div className="text-xs text-green-600">Itinéraires voitures (routes OSRM)</div>
          </div>
        </div>
        <span className="text-green-700 text-sm font-medium">{downloading === "geojson" ? "⏳" : ".geojson"}</span>
      </button>

      <div className="pt-2">
        <h3 className="text-sm font-bold text-gray-700 mb-2">🗺️ Données Nationales (OSM)</h3>
        <button
          onClick={async () => {
            setDownloading("algeria-roads");
            const qs = selectedWilayas.length ? `?wilayas=${selectedWilayas.join(",")}` : "";
            window.open(`/api/simulation/export-algeria-roads${qs}`, "_blank");
            setTimeout(() => setDownloading(null), 2000);
          }}
          disabled={downloading !== null}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">🇩🇿</span>
            <div className="text-left">
              <div className="font-semibold text-red-800 text-sm">{selectedWilayas.length ? `Réseau Wilayas ${selectedWilayas.join(", ")}` : "Réseau Routier Nord-Algérie"}</div>
              <div className="text-xs text-red-600">{selectedWilayas.length ? `${selectedWilayas.length} wilaya(s) — routes OSM réelles` : "Routes OSM réelles (Overpass)"}</div>
            </div>
          </div>
          <span className="text-red-700 text-sm font-medium">{downloading === "algeria-roads" ? "⏳" : ".geojson"}</span>
        </button>
        <p className="text-[10px] text-gray-400 mt-2 italic text-center">
          * Extraction Overpass directe (pas de fallback étoilé). {selectedWilayas.length ? "1 fichier/wilaya en zip." : "Peut prendre 10-20s — filtre 1-2 wilayas si timeout."}
        </p>
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 border">
        <div className="font-semibold mb-1">📋 Contenu exporté :</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Itinéraires réels (routes OpenStreetMap via OSRM)</li>
          <li>Points d&apos;origine et de destination</li>
          <li>Attributs : ID voiture, conducteur, téléphone, villes</li>
          <li>Système de coordonnées : WGS84 (EPSG:4326)</li>
        </ul>
      </div>
    </div>
  );
}
