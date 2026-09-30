import { NextRequest, NextResponse } from "next/server";
import {
  createSimulation,
  getSimulation,
  startSimulation,
  stopSimulation,
  destroySimulation,
  getBufferStats,
} from "@/lib/simulationManager";
import { carsToGeoJSON } from "@/lib/simulation";
import { db } from "@/db";
import { voitures, footprints } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

// GET - get current simulation state
export async function GET() {
  const state = getSimulation();
  if (!state) {
    return NextResponse.json({ running: false, cars: [] });
  }

  const bufferStats = getBufferStats();

  // Ajoute aussi les voitures externes (EXT-*) de la base pour affichage même sans simulation
  let externalCars: any[] = [];
  try {
    const extRows = await db.selectDistinctOn([voitures.carId], {
      carId: voitures.carId, lat: footprints.latitude, lon: footprints.longitude, speed: footprints.vitesse, heading: footprints.cap, immat: voitures.immatriculation, marque: voitures.marque,
    }).from(footprints).innerJoin(voitures, eq(footprints.voitureId, voitures.id)).where(sql`${voitures.carId} LIKE 'EXT-%'`).orderBy(voitures.carId, desc(footprints.recordedAt)).limit(20);
    // Fallback simple si distinctOn non supporté
    if (!extRows.length) {
      const allExt = await db.select({ carId: voitures.carId, lat: footprints.latitude, lon: footprints.longitude, speed: footprints.vitesse, heading: footprints.cap }).from(footprints).innerJoin(voitures, eq(footprints.voitureId, voitures.id)).where(sql`${voitures.carId} LIKE 'EXT-%'`).orderBy(desc(footprints.recordedAt)).limit(50);
      const seen = new Set();
      for (const r of allExt) if (!seen.has(r.carId)) { seen.add(r.carId); extRows.push(r as any); }
    }
    externalCars = extRows;
  } catch {}

  const allCarsForMap = [...state.cars];
  // Injecte les externes non déjà en mémoire (avec vrai nom départ/arrivée choisi dans l'app externe)
  for (const ec of externalCars) {
    if (!allCarsForMap.find(c => c.voiture.carId === ec.carId)) {
      let oCity = "Externe", dCity = "Externe";
      try {
        const { itineraires, voitures: vtab } = await import("@/db/schema");
        const vrow = await db.select({ id: vtab.id }).from(vtab).where(eq(vtab.carId, ec.carId)).limit(1);
        if (vrow[0]?.id) {
          const irow = await db.select({ villeDepart: itineraires.villeDepart, villeArrivee: itineraires.villeArrivee }).from(itineraires).where(eq(itineraires.voitureId, vrow[0].id)).orderBy(desc(itineraires.id)).limit(1);
          if (irow[0]?.villeDepart) oCity = irow[0].villeDepart;
          if (irow[0]?.villeArrivee) dCity = irow[0].villeArrivee;
        }
      } catch {}
      allCarsForMap.push({
        voiture: { carId: ec.carId, immatriculation: ec.immat || ec.carId, marque: ec.marque || "Externe", modele: "Sim", couleur: "Gris", mapColor: "#ff6b35" } as any,
        lat: ec.lat, lon: ec.lon, speed: ec.speed || 0, heading: ec.heading || 0, status: "en route",
        originCity: oCity, destinationCity: dCity, routePoints: [], itineraireActuel: { id: "ext", villeDepart: oCity, villeArrivee: dCity } as any,
      } as any);
    }
  }

  return NextResponse.json({
    running: state.running,
    sessionId: state.sessionId,
    config: state.config,
    customRoads: state.customRoads,
    carsGeoJSON: carsToGeoJSON(allCarsForMap as any),
    carsList: allCarsForMap.map((c: any) => ({
      carId: c.voiture.carId,
      immatriculation: c.voiture.immatriculation,
      marque: c.voiture.marque,
      modele: c.voiture.modele,
      proprietaire: c.voiture.proprietaire?.type === "physique"
        ? `${c.voiture.proprietaire.prenom} ${c.voiture.proprietaire.nom}`
        : c.voiture.proprietaire?.raisonSociale || "Externe",
      proprietaireTel: c.voiture.proprietaire?.telephone || "",
      conducteur: c.conducteurActuel ? `${c.conducteurActuel.prenom} ${c.conducteurActuel.nom}` : "Externe",
      conducteurTel: c.conducteurActuel?.telephone || "",
      speed: c.speed || 0,
      status: c.status || "en route",
      color: c.voiture.mapColor,
      originCity: c.originCity,
      destinationCity: c.destinationCity,
    })),
    proprietaires: state.proprietaires,
    conducteurs: state.conducteurs,
    bufferStats,
    totalRecordsSentToDb: state.totalRecordsSent,
  });
}

// POST - create / start / stop simulation
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const {
      numCars = 4,
      recordIntervalSec = 1,
      timeMultiplier = 60,
      flushThresholdKb = 50,
      flushThresholdMinutes = 2,
      selectedWilayas = [],
      vehicleCategories,
      simulateContresens,
      maxContinuousDrivingHours,
      customOrigin,
      customDestination,
    } = body;

    const state = createSimulation({
      numCars,
      recordIntervalSec,
      timeMultiplier,
      flushThresholdKb,
      flushThresholdMinutes,
      selectedWilayas,
      vehicleCategories,
      simulateContresens,
      maxContinuousDrivingHours,
      customOrigin,
      customDestination,
    } as any);

    // Prépare les routes sans lancer la course (pour affichage avant GO)
    // On génère les itinéraires via OSRM/perso de manière synchrone
    const { assignRouteForCar } = await import("@/lib/simulationManager");
    for (let i = 0; i < state.cars.length; i++) {
      if (state.cars[i].needsNewRoute) {
        state.cars[i] = await assignRouteForCar(state.cars[i], state.conducteurs);
        state.cars[i].needsNewRoute = false;
        state.cars[i].status = "idle";
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId: state.sessionId,
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
        proprietaireNom: c.voiture.proprietaire.type === "physique" ? `${c.voiture.proprietaire.prenom} ${c.voiture.proprietaire.nom}` : c.voiture.proprietaire.raisonSociale,
        conducteurNom: `${c.conducteurActuel.prenom} ${c.conducteurActuel.nom}`,
        speed: c.speed,
        status: c.status,
        color: c.voiture.mapColor,
        originCity: c.originCity,
        destinationCity: c.destinationCity,
        routeProgress: 0,
      })),
      carRoutes: Object.fromEntries(
        state.cars.filter(c => c.routePoints.length > 1).map(c => [
          c.voiture.carId,
          { points: c.routePoints.filter((_, i) => i % 3 === 0 || i === c.routePoints.length - 1), color: c.voiture.mapColor, origin: c.originCity, destination: c.destinationCity }
        ])
      ),
      proprietaires: state.proprietaires.length,
      conducteurs: state.conducteurs.length,
    });
  }

  if (action === "start") {
    const state = startSimulation();
    return NextResponse.json({ ok: true, running: !!state?.running });
  }

  if (action === "stop") {
    stopSimulation();
    return NextResponse.json({ ok: true, running: false });
  }

  if (action === "destroy") {
    destroySimulation();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
