import { NextRequest, NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";

export async function POST(req: NextRequest) {
  const state = getSimulation();
  if (!state) return NextResponse.json({ error: "No simulation" }, { status: 404 });
  const body = await req.json();
  const { carId } = body as { carId: string };
  if (!carId) return NextResponse.json({ error: "carId requis" }, { status: 400 });
  const car = state.cars.find(c => c.voiture.carId === carId);
  if (!car) return NextResponse.json({ error: "Car not found" }, { status: 404 });

  // Force immédiat : inverse la route actuelle + crée une infraction visible sans attendre le tick
  if (car.routePoints.length >= 2) {
    car.routePoints = [...car.routePoints].reverse();
    car.routeIndex = 0;
    if (!car.currentRoadRestrictions) car.currentRoadRestrictions = {} as any;
    (car.currentRoadRestrictions as any).oneway = "yes";
    car.currentRoadName = (car.currentRoadName || "Route") + " [CONTRSESENS TEST]";
    // Infraction immédiate pour feedback direct (pas besoin d'attendre 15s de cooldown)
    const { v4: uuidv4 } = await import("uuid");
    const now = new Date();
    (state as any).infractions = (state as any).infractions || [];
    (state as any).infractions.push({
      id: uuidv4(),
      carId: car.voiture.carId,
      immatriculation: car.voiture.immatriculation,
      conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
      roadName: car.currentRoadName,
      troncon: car.currentRoadName,
      infraction: "circulation à contresens" as const,
      speed: Math.round((car.speed || 50) * 10) / 10,
      speedLimit: (car.currentRoadMaxSpeed ?? 90) as number,
      excess: 0,
      restriction: `Test manuel contresens oneway=yes`,
      lat: car.lat, lon: car.lon,
      recordedAt: now.toISOString(),
      itineraireId: car.itineraireActuel.id,
    });
    return NextResponse.json({ ok: true, carId, message: "Contresens simulé - infraction visible dans l'onglet Infractions" });
  }
  car.needsNewRoute = true;
  state.routeFetchQueue.add(carId);
  (car as any)._forceContresensNext = true;
  return NextResponse.json({ ok: true, carId, message: "Contresens programmé au prochain itinéraire" });
}
