import { NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";

export async function POST() {
  const state = getSimulation();
  if (!state) {
    return NextResponse.json({ error: "No simulation running" }, { status: 404 });
  }

  // Supprimer le réseau personnalisé
  state.customRoads = null;

  // Forcer les voitures à demander de nouveaux itinéraires (qui seront désormais OSRM)
  for (const car of state.cars) {
    car.needsNewRoute = true;
    car.routePoints = [];
    car.routeIndex = 0;
    car.status = "idle";
  }

  return NextResponse.json({
    ok: true,
    message: "Retour au mode OSRM (routes réelles) effectué.",
  });
}
