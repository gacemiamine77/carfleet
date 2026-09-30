"use client";

interface CarInfo {
  carId: string;
  speed: number;
  status: string;
  distanceKm?: number;
  conducteurProfil?: string;
  routeProgress?: number;
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

  const activeCars = cars.filter(c => c.status === "en route");
  const avgSpeed = activeCars.length > 0 
    ? Math.round(activeCars.reduce((acc, c) => acc + c.speed, 0) / activeCars.length) 
    : 0;

  const totalDist = totalCars > 0 
    ? Math.round(cars.reduce((acc, c) => acc + (c.distanceKm || 0), 0) * 10) / 10 
    : 0;

  const avgProgress = totalCars > 0 
    ? Math.round(cars.reduce((acc, c) => acc + (c.routeProgress || 0), 0) / totalCars) 
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
      {/* Total Distance */}
      <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
        <div className="text-xs font-bold text-gray-500 uppercase">Distance Totale</div>
        <div className="flex items-baseline gap-1">
          <div className="text-2xl font-bold text-gray-800">{totalDist}</div>
          <div className="text-sm text-gray-400 font-medium">km</div>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">Cumul de la flotte en cours</div>
      </div>

      {/* Average Speed */}
      <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-emerald-500">
        <div className="text-xs font-bold text-gray-500 uppercase">Vitesse Moyenne</div>
        <div className="flex items-baseline gap-1">
          <div className="text-2xl font-bold text-gray-800">{avgSpeed}</div>
          <div className="text-sm text-gray-400 font-medium">km/h</div>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">Moyenne instantanée</div>
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
