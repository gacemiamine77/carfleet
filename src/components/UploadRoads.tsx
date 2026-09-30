"use client";

import { useState } from "react";

interface Props {
  hasSimulation: boolean;
}

export default function UploadRoads({ hasSimulation }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ segments: number; size: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Vérification de sécurité (50 Mo max)
    if (file.size > 50 * 1024 * 1024) {
      setError("Le fichier est trop volumineux (max 50 Mo).");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(10);
    setStatus("Lecture du fichier...");

    try {
      // 1. Lire le fichier localement
      const text = await file.text();
      setProgress(30);
      setStatus("Analyse du JSON...");
      
      const geojson = JSON.parse(text);
      setProgress(50);
      setStatus("Envoi au serveur (cela peut prendre du temps)...");

      // 2. Envoyer au serveur
      const res = await fetch("/api/simulation/upload-roads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geojson),
      });

      setProgress(90);
      setStatus("Finalisation...");

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur serveur lors de l'upload.");
      }

      const data = await res.json();

      if (data.ok) {
        setResult({ 
          segments: data.segments, 
          size: (file.size / (1024 * 1024)).toFixed(2) + " Mo" 
        });
        setStatus("Terminé !");
        setProgress(100);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur lors de l'upload.");
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 3000);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/simulation/reset-roads", { method: "POST" });
      if (res.ok) {
        setResult(null);
        setError(null);
        setStatus("Mode OSRM activé");
      }
    } catch (err) {
      setError("Erreur lors de la réinitialisation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 border border-dashed border-blue-300">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          🛤️ Réseau Personnalisé
        </h2>
        {(result || status === "Mode OSRM activé") && (
          <button
            onClick={handleReset}
            className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded transition-colors"
            title="Revenir aux routes réelles OSRM"
          >
            🔄 Revenir à OSRM
          </button>
        )}
      </div>
      
      <p className="text-xs text-gray-500 mb-4">
        Uploadez votre propre <b>GeoJSON</b> (LineStrings) pour remplacer le routage OSM/OSRM.
        {!hasSimulation && <><br/><span className="text-amber-600">⏳ Sera utilisé au prochain démarrage.</span></>}
      </p>

      <div className="relative">
        <input
          type="file"
          accept=".geojson,.json"
          onChange={handleFileChange}
          disabled={loading}
          className="hidden"
          id="roads-upload"
        />
        <label
          htmlFor="roads-upload"
          className={`flex flex-col items-center justify-center w-full min-h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${
            loading ? "bg-blue-50 border-blue-400" : ""
          }`}
        >
          <div className="flex flex-col items-center justify-center p-4">
            {loading ? (
              <div className="w-full space-y-3">
                <div className="flex justify-between text-xs font-bold text-blue-700">
                  <span>{status}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[10px] text-center text-blue-500 animate-pulse">
                  Ne fermez pas la page...
                </p>
              </div>
            ) : (
              <>
                <span className="text-2xl mb-1">📁</span>
                <p className="text-xs text-gray-500 font-medium">
                  Cliquer pour uploader un GeoJSON
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Limite conseillée : 50 Mo
                </p>
              </>
            )}
          </div>
        </label>
      </div>

      {result && (
        <div className="mt-3 p-3 bg-green-50 text-green-700 text-xs rounded border border-green-200">
          <div className="font-bold flex items-center gap-1 mb-1">
            <span>✅</span> Réseau chargé avec succès
          </div>
          <ul className="list-disc list-inside opacity-80">
            <li>Taille : {result.size}</li>
            <li>Segments : {result.segments}</li>
          </ul>
          <p className="mt-2 font-medium italic">
            Les voitures vont maintenant piocher dans vos segments.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-200">
          ❌ {error}
        </div>
      )}

      <div className="mt-4 text-[10px] text-gray-400 bg-gray-50 p-2 rounded">
        <b>Conseil :</b> Votre GeoJSON doit contenir des <i>LineString</i>. Chaque segment sera parcouru par une voiture de manière aléatoire.
      </div>
    </div>
  );
}
