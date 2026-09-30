import { NextResponse } from "next/server";
import { tickSimulation, getBufferStats, getSimulation } from "@/lib/simulationManager";
import { carsToGeoJSON } from "@/lib/simulation";

// POST - advance simulation by one tick and return new state
export async function POST() {
  const state = tickSimulation();
  if (!state) {
    return NextResponse.json({ error: "No simulation running" }, { status: 404 });
  }

  const bufferStats = getBufferStats();

  // Envoi temps réel des nouvelles infractions vers les unités de sécurité (fire-and-forget)
  let dispatched = 0;
  try {
    const { dispatchInfractions } = await import("@/lib/unites");
    if (state.infractions.length) {
      const r = await dispatchInfractions(state.infractions as any);
      dispatched = r.inserted;
    }
  } catch {}

  const allTerminated = state.cars.length > 0 && state.cars.every((c) => c.status === "terminé" || c.status === "arrivée" || c.status === "termine");
  return NextResponse.json({
    running: state.running,
    allTerminated,
    customRoads: state.customRoads,
    carsGeoJSON: carsToGeoJSON(state.cars),
    carsList: state.cars.map((c) => ({
      carId: c.voiture.carId,
      immatriculation: c.voiture.immatriculation,
      marque: c.voiture.marque,
      modele: c.voiture.modele,
      couleurVoiture: c.voiture.couleur,
      categorieVehicule: (c.voiture as any).categorieVehicule,
      hauteur: (c.voiture as any).hauteur,
      largeur: (c.voiture as any).largeur,
      poids: (c.voiture as any).poids,
      convoiSpecial: (c.voiture as any).convoiSpecial,
      // Propriétaire
      proprietaireType: c.voiture.proprietaire.type,
      proprietaireNom: c.voiture.proprietaire.type === "physique"
        ? `${c.voiture.proprietaire.prenom} ${c.voiture.proprietaire.nom}`
        : c.voiture.proprietaire.raisonSociale,
      proprietaireTel: c.voiture.proprietaire.telephone,
      proprietaireWilaya: c.voiture.proprietaire.wilaya,
      // Conducteur
      conducteurNom: `${c.conducteurActuel.prenom} ${c.conducteurActuel.nom}`,
      conducteurTel: c.conducteurActuel.telephone,
      conducteurPermis: c.conducteurActuel.numeroPermis,
      // Itinéraire
      itineraireId: c.itineraireActuel.id,
      itineraireStatut: c.itineraireActuel.statut,
      originCity: c.originCity,
      destinationCity: c.destinationCity,
      // Métriques
      speed: Math.round(c.speed * 10) / 10,
      acceleration: Math.round(c.acceleration * 100) / 100,
      status: c.status,
      color: c.voiture.mapColor,
      distanceKm: c.itineraireActuel.distanceKm,
      totalDistanceKm: Math.round(c.totalDistanceTraveled / 10) / 100,
      routeProgress: c.routePoints.length > 0
        ? Math.round((c.routeIndex / Math.max(1, c.routePoints.length - 1)) * 100)
        : 0,
    })),
    // Footprints (trails) for map display - INTEGRALITÉ DU TRAJET
    footprints: Object.fromEntries(
      state.cars.map((c) => [
        c.voiture.carId,
        {
          // On envoie tous les points accumulés depuis le début
          trail: c.footprintTrail.map((p) => [p.lat, p.lon]), 
          // Historique complet des vitesses
          speeds: c.footprintTrail.map((p) => p.speed),
          color: c.voiture.mapColor,
        },
      ])
    ),
    // Planned routes
    carRoutes: Object.fromEntries(
      state.cars
        .filter((c) => c.routePoints.length > 1)
        .map((c) => [
          c.voiture.carId,
          {
            points: c.routePoints.filter((_, i) => i % 3 === 0 || i === c.routePoints.length - 1),
            color: c.voiture.mapColor,
            origin: c.originCity,
            destination: c.destinationCity,
          },
        ])
    ),
    bufferStats,
    totalRecordsSentToDb: state.totalRecordsSent,
    infractions: [...state.infractions].sort((a,b)=> new Date(b.recordedAt).getTime()-new Date(a.recordedAt).getTime()),
    infractionsCount: state.infractions.length,
    unitesDispatched: dispatched,
  });
}
