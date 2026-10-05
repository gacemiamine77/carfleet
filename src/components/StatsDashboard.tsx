"use client";

interface CarInfo {
  carId: string;
  speed: number;
  status: string;
  distanceKm?: number;
  conducteurProfil?: string;
  routeProgress?: number;
  categorieVehicule?: string;
}

interface Props {
  cars: CarInfo[];
}

export default function StatsDashboard({ cars }: Props) {
  const totalCars = cars.length;
  const isTerminated = (s: string) => s === "terminé" || s === "arrivée" || s === "termine" || s === "terminés";
  const movingCars = cars.filter(c => c.status === "en route").length;
  const stoppedCars = cars.filter(c => isTerminated(c.status)).length;
  const idleCars = cars.filter(c => c.status !== "en route" && !isTerminated(c.status)).length;

  const avgProgress = totalCars > 0
    ? Math.round(cars.reduce((acc, c) => acc + (c.routeProgress || 0), 0) / totalCars)
    : 0;

  // Répartition par type de véhicule (%)
  const CATS = [
    { id: "leger", label: "Léger", emoji: "🚗" },
    { id: "lourd", label: "Lourd", emoji: "🚚" },
    { id: "transport", label: "Transport", emoji: "🚐" },
    { id: "transport_dangereux", label: "Dangereux", emoji: "☢️" },
    { id: "convoi_exceptionnel", label: "Convoi Exc.", emoji: "🚛" },
    { id: "transport_personnel", label: "Personnel", emoji: "🚙" },
  ];
  const catCounts = CATS.map((c) => ({
    ...c,
    n: cars.filter((v) => (v.categorieVehicule || "leger") === c.id).length,
  })).filter((c) => c.n > 0);
  const pct = (n: number) => (totalCars > 0 ? Math.round((n / totalCars) * 100) : 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
      {/* Répartition par type de véhicule */}
      <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500 md:col-span-2">
        <div className="text-xs font-bold text-gray-500 uppercase">🚛 Types de véhicules ({totalCars})</div>
        {catCounts.length === 0 ? (
          <div className="text-xs text-gray-400 mt-2">Aucun véhicule</div>
        ) : (
          <div className="mt-2 space-y-1.5">
            {catCounts.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate">{c.emoji} {c.label}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct(c.n)}%` }} />
                </div>
                <span className="font-bold w-8 text-right">{c.n}</span>
                <span className="text-gray-400 w-10 text-right">{pct(c.n)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-500">
        <div className="text-xs font-bold text-gray-500 uppercase">État de la Flotte</div>
        <div className="flex gap-3 mt-1">
          <div className="text-center">
            <div className="text-sm font-bold text-green-600">{movingCars}</div>
            <div className="text-[9px] text-gray-400 uppercase">En route</div>
          </div>
          <div className="text-center border-x px-3">
            <div className="text-sm font-bold text-blue-600">{stoppedCars}</div>
            <div className="text-[9px] text-gray-400 uppercase">Arrivés</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-500">{idleCars}</div>
            <div className="text-[9px] text-gray-400 uppercase">Attente</div>
          </div>
        </div>
      </div>

      {/* Global Progress */}
      <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
        <div className="text-xs font-bold text-gray-500 uppercase">Progression Globale</div>
        <div className="flex items-baseline gap-1">
          <div className="text-2xl font-bold text-gray-800">{avgProgress}</div>
          <div className="text-sm text-gray-400 font-medium">%</div>
        </div>
        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
          <div 
            className="h-full bg-purple-500 transition-all duration-500" 
            style={{ width: `${avgProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
