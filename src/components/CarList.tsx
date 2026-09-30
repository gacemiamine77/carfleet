"use client";
import { useState } from "react";
import SpeedProfileEditor from "./SpeedProfileEditor";

interface CarInfo {
  carId: string;
  immatriculation?: string;
  marque?: string;
  modele?: string;
  couleurVoiture?: string;
  categorieVehicule?: string;
  hauteur?: number;
  largeur?: number;
  poids?: number;
  convoiSpecial?: boolean;
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

interface Props {
  cars: CarInfo[];
  selectedCar: string | null;
  onSelectCar: (carId: string | null) => void;
  onDownloadGeoJSON: (carId: string) => void;
}

export default function CarList({
  cars,
  selectedCar,
  onSelectCar,
  onDownloadGeoJSON,
}: Props) {
  const [editingCar, setEditingCar] = useState<string | null>(null);
  const sorted = [...cars].sort((a, b) => {
    if (a.carId === selectedCar) return -1;
    if (b.carId === selectedCar) return 1;
    return b.speed - a.speed;
  });

  const isTerminated = (s: string) => s === "terminé" || s === "terminés" || s === "arrivée" || s === "termine";
  const movingCount = cars.filter((c) => c.status === "en route").length;
  const stoppedCount = cars.filter((c) => isTerminated(c.status)).length;
  const idleCount = cars.filter((c) => c.status !== "en route" && !isTerminated(c.status)).length;
  const avgSpeed = cars.length > 0
    ? Math.round(cars.reduce((s, c) => s + c.speed, 0) / cars.length)
    : 0;

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 border border-gray-100">
      <h2 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
        🚗 Flotte ({cars.length})
      </h2>

      {cars.length > 0 && (
        <div className="flex gap-2 mb-3 text-xs flex-wrap">
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            {movingCount} en route
          </span>
          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
            {stoppedCount} arrêté
          </span>
          <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
            {idleCount} en attente
          </span>
          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            ~{avgSpeed} km/h moy
          </span>
        </div>
      )}

      <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
        {sorted.map((car) => (
          <div
            key={car.carId}
            onClick={() =>
              onSelectCar(selectedCar === car.carId ? null : car.carId)
            }
            className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${
              selectedCar === car.carId
                ? "border-blue-500 bg-blue-50 shadow-md"
                : "border-transparent bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full shadow-inner flex-shrink-0"
                  style={{ backgroundColor: car.color }}
                />
                <div>
                  <span className="font-bold text-sm">{car.carId}</span>
                  {car.immatriculation && (
                    <span className="text-xs text-gray-500 ml-1">
                      ({car.immatriculation})
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  car.status === "en route" ? "bg-green-100 text-green-700" :
                  car.status === "terminé" || car.status === "arrivée" || car.status === "termine" ? "bg-gray-800 text-white" :
                  car.status === "arrêt temporaire" ? "bg-red-100 text-red-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}
              >
                {car.status === "en route" ? "En route" : 
                 car.status === "terminé" || car.status === "arrivée" || car.status === "termine" ? "Terminé ✓" : 
                 car.status === "arrêt temporaire" ? "Arrêté" : 
                 car.status === "chargement route..." ? "Chargement..." : "Attente"}
              </span>
            </div>

            {/* Véhicule */}
            {(car.marque || car.modele) && (
              <div className="text-xs text-gray-500 mb-1">
                🚙 {car.marque} {car.modele} {car.couleurVoiture && `(${car.couleurVoiture})`}
              </div>
            )}
            {/* Gabarit / Catégorie */}
            {(car.categorieVehicule || car.hauteur) && (
              <div className="text-xs bg-amber-50 rounded px-2 py-1 mb-1 border border-amber-100">
                <div className="flex items-center gap-1 font-medium text-amber-800">
                  <span>{car.categorieVehicule === "leger" ? "🚗" : car.categorieVehicule === "lourd" ? "🚚" : car.categorieVehicule === "transport_dangereux" ? "☢️" : car.categorieVehicule === "convoi_exceptionnel" ? "🚛" : "🚐"}</span>
                  <span>{car.categorieVehicule || "leger"}</span>
                  {car.convoiSpecial && <span className="ml-1 bg-amber-600 text-white text-[9px] px-1 rounded">CONVOI</span>}
                </div>
                <div className="text-gray-600 text-[11px] mt-0.5">
                  {car.hauteur && <>H:{car.hauteur}m </>}{car.largeur && <>L:{car.largeur}m </>}{car.poids && <>P:{car.poids}t</>}
                </div>
              </div>
            )}

            {/* Propriétaire */}
            {car.proprietaireNom && (
              <div className="text-xs bg-purple-50 rounded px-2 py-1 mb-1">
                <div className="flex items-center gap-1">
                  <span>{car.proprietaireType === "morale" ? "🏢" : "👤"}</span>
                  <span className="font-medium">{car.proprietaireNom}</span>
                </div>
                {car.proprietaireTel && (
                  <div className="text-gray-500">📱 {car.proprietaireTel}</div>
                )}
                {car.proprietaireWilaya && (
                  <div className="text-gray-500">📍 {car.proprietaireWilaya}</div>
                )}
              </div>
            )}

            {/* Conducteur */}
            {car.conducteurNom && (
              <div className="text-xs bg-blue-50 rounded px-2 py-1 mb-1">
                <div className="flex items-center gap-1">
                  <span>🧑‍✈️</span>
                  <span className="font-medium">{car.conducteurNom}</span>
                </div>
                {car.conducteurTel && (
                  <div className="text-gray-500">📱 {car.conducteurTel}</div>
                )}
                {car.conducteurPermis && (
                  <div className="text-gray-500">🪪 {car.conducteurPermis}</div>
                )}
              </div>
            )}

            {/* Itinéraire */}
            {(car.originCity || car.destinationCity) && (
              <div className="text-xs bg-green-50 rounded px-2 py-1 mb-1">
                <div className="text-gray-600">
                  📍 {car.originCity || "?"} → {car.destinationCity || "..."}
                </div>
                {car.itineraireStatut && (
                  <div className="text-gray-500">
                    État: {car.itineraireStatut === "en_cours" ? "🟢 En cours" : 
                           car.itineraireStatut === "termine" ? "✅ Terminé" : "⚠️ Interrompu"}
                  </div>
                )}
                {car.routeProgress !== undefined && car.routeProgress > 0 && (
                  <div className="mt-1">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${car.routeProgress}%` }}
                      />
                    </div>
                    <div className="text-right text-gray-400 text-[10px] mt-0.5">
                      {car.routeProgress}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Métriques */}
            <div className="flex gap-3 mt-1 text-xs">
              <span>
                🏎️{" "}
                <b
                  className={
                    car.speed > 80
                      ? "text-red-600"
                      : car.speed > 40
                      ? "text-orange-600"
                      : "text-green-600"
                  }
                >
                  {car.speed} km/h
                </b>
              </span>
              {car.distanceKm !== undefined && (
                <span>📏 {car.distanceKm} km</span>
              )}
              {car.totalDistanceKm !== undefined && (
                <span className="text-gray-400">Σ {car.totalDistanceKm} km</span>
              )}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadGeoJSON(car.carId);
                }}
                className="flex-1 text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors font-medium"
              >
                📥 Footprint
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingCar(editingCar === car.carId ? null : car.carId); }}
                className="flex-1 text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-1 rounded transition-colors font-medium"
              >
                ✏️ Vitesse
              </button>
              <button
                onClick={async e => { e.stopPropagation(); await fetch("/api/simulation/contresens", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({carId: car.carId})}); }}
                className="flex-1 text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded transition-colors font-medium"
                title="Faire rouler à contresens pour tester l'infraction"
              >
                ⛔ Contresens
              </button>
              <button
                onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('select-itinerary', { detail: car.carId })); }}
                className="flex-1 text-[10px] bg-sky-100 hover:bg-sky-200 text-sky-700 px-2 py-1 rounded transition-colors font-medium"
                title="Choisir départ/arrivée sur la carte"
              >
                📍 Itinéraire
              </button>
              {(car.status === "terminé" || car.status === "arrivée" || car.status === "termine") && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const res = await fetch("/api/simulation/new-mission", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ carId: car.carId }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      fetch("/api/simulation/tick", { method: "POST" });
                    }
                  }}
                  className="flex-1 text-[10px] bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded transition-colors font-bold animate-bounce"
                  title="Relance uniquement ce véhicule"
                >
                  🚀 Repartir
                </button>
              )}
            </div>
            {editingCar === car.carId && (
              <div className="mt-2">
                <SpeedProfileEditor carId={car.carId} color={car.color} onClose={() => setEditingCar(null)} />
              </div>
            )}
          </div>
        ))}

        {cars.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            <div className="text-3xl mb-2">🗺️</div>
            Configurez et lancez la simulation pour voir la flotte.
          </div>
        )}
      </div>
    </div>
  );
}
