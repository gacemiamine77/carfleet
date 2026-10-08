import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { footprints, voitures, itineraires, conducteurs, proprietaires, simulationSessions, vehicleCurrentPosition } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

// POST - receive external tracking data (GPS devices, other computer)
// Body: { carId|vehicle_id, lat, lon, speed?, heading?, fuel?, recordedAt|timestamp?, sessionId? } ou { cars: [...] }
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json();
    const cars = Array.isArray(body.cars) ? body.cars : [body];
    if (!cars.length || !(cars[0].carId || cars[0].vehicle_id) || cars[0].lat == null) {
      return NextResponse.json({ error: "carId (ou vehicle_id), lat, lon requis (ou {cars:[...]})" }, { status: 400 });
    }

    // Ensure a session exists for external data
    const sessionId = body.sessionId || "external-" + new Date().toISOString().split("T")[0];
    let session = await db.select().from(simulationSessions).where(eq(simulationSessions.sessionId, sessionId)).limit(1);
    if (!session.length) {
      await db.insert(simulationSessions).values({
        sessionId,
        numVoitures: cars.length,
        intervalleEnregistrement: 2,
        seuilFlushKb: 50,
        seuilFlushMinutes: 2,
        totalEnregistrements: 0,
      }).onConflictDoNothing();
    }

    let inserted = 0;
    let rejected = 0;
    // Batch : 1 seul INSERT multi-lignes pour footprints + 1 upsert groupé pour le temps réel
    const fpRows: any[] = [];
    const liveRows: any[] = [];
  const clamp = (lat:number, lon:number) => ({
    lat: Math.max(32.5, Math.min(37.5, lat)),
    lon: Math.max(-2.5, Math.min(9.0, lon)),
  });
  for (const c of cars) {
    // Dispositif enregistré : le n° de série virtuel retrouve le véhicule du registre
    // (marque/modèle/immat du registre utilisés tels quels).
    let serialVoiture: any = null;
    const serialIn = typeof c.serial === "string" && c.serial.trim() ? c.serial.trim().slice(0, 40) : "";
    if (serialIn) {
      try {
        const found = await db.select().from(voitures).where(eq(voitures.numeroSerie, serialIn)).limit(1);
        if (found.length) serialVoiture = found[0];
      } catch {}
    }
    const carId = serialVoiture ? serialVoiture.carId : String(c.carId || c.vehicle_id || `EXT-${Math.random().toString(36).slice(2,6)}`);
    let lat = Number(c.lat), lon = Number(c.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Aliases payload GPS : fuel (% réservoir), recordedAt/timestamp
    const fuelRaw = c.fuel ?? c.carburant;
    const fuel = fuelRaw == null ? null : Number(fuelRaw);
    const tsRaw = c.recordedAt || c.timestamp;
    let recAt = tsRaw ? new Date(tsRaw) : new Date();
    if (isNaN(recAt.getTime())) recAt = new Date();
    const cl = clamp(lat, lon);
    lat = cl.lat; lon = cl.lon;
    // Champs enrichis depuis l'app externe (tout ce qu'a la plateforme)
    const extMarque = c.marque, extModele = c.modele, extCouleur = c.couleur, extImmat = c.immatriculation,
          extCat = c.categorieVehicule, extH = c.hauteur, extL = c.largeur, extPoids = c.poids, extConvoi = c.convoiSpecial,
          extPropNom = c.proprietaireNom, extPropPrenom = c.proprietairePrenom, extPropTel = c.proprietaireTel, extPropWilaya = c.proprietaireWilaya,
          extCondNom = c.conducteurNom, extCondPrenom = c.conducteurPrenom, extCondTel = c.conducteurTel, extCondPermis = c.conducteurPermis,
          extOriginName = (c.originName || c.villeDepart || "")?.toString().slice(0,100),
          extDestName = (c.destName || c.villeArrivee || "")?.toString().slice(0,100);
    // Champs OBLIGATOIRES pour tracker : matricule + nom chauffeur + nom propriétaire
    if (!String(extImmat || "").trim() || !String(extCondNom || "").trim() || !String(extPropNom || "").trim()) {
      rejected++;
      continue;
    }
    const extVilleDep = extOriginName || "Externe", extVilleArr = extDestName || "Externe";

      let voiture = serialVoiture ? [serialVoiture] : await db.select().from(voitures).where(eq(voitures.carId, carId)).limit(1);
      let voitureId: number;
      if (!voiture.length) {
        const nin = `EXT-${carId}-${Date.now()}`.slice(0,20);
        let propId: number | undefined;
        try {
          const [prop] = await db.insert(proprietaires).values({
            nin, type: "physique" as any, nom: extPropNom?.slice(0,100) || "Externe", prenom: extPropPrenom?.slice(0,100) || carId.slice(0,20), telephone: extPropTel || "+213000000000",
            adresse: "Externe", commune: extPropWilaya || "Externe", wilaya: extPropWilaya || "Externe", codeWilaya: "00",
          }).onConflictDoNothing().returning();
          propId = prop?.id || (await db.select().from(proprietaires).where(eq(proprietaires.nin, nin)).limit(1))[0]?.id;
        } catch (e: any) {
          console.error("prop insert fail", e, e?.cause, e?.detail);
          const existing = await db.select().from(proprietaires).where(eq(proprietaires.nin, nin)).limit(1);
          propId = existing[0]?.id;
          if (!propId) {
            const anyProp = await db.select().from(proprietaires).where(eq(proprietaires.nom, "Externe")).limit(1);
            propId = anyProp[0]?.id;
          }
          if (!propId) {
            try {
              const [p2] = await db.insert(proprietaires).values({ nin, type: "physique" as any, nom: extPropNom?.slice(0,100) || "Externe", prenom: extPropPrenom?.slice(0,100) || carId.slice(0,20), telephone: extPropTel || "+213000000000", adresse: "Externe", commune: extPropWilaya || "Externe", wilaya: extPropWilaya || "Externe", codeWilaya: "00" }).returning();
              propId = p2?.id;
            } catch (e2) { console.error("prop fallback fail", e2); }
          }
        }
        if (!propId) { console.error("no propId for", carId, nin); continue; }
        let voitId: number | undefined;
        try {
          const [voit] = await db.insert(voitures).values({
            carId, proprietaireId: propId, immatriculation: (extImmat || `EXT-${carId}`).slice(0,20), marque: extMarque || "Externe", modele: extModele || "Sim", couleur: extCouleur || "Gris", annee: 2024, mapColor: "#ff6b35",
            categorieVehicule: (extCat as any) || "leger", hauteur: extH ? Number(extH) : 1.6, largeur: extL ? Number(extL) : 1.8, poids: extPoids ? Number(extPoids) : 1.5, convoiSpecial: !!extConvoi,
          } as any).onConflictDoNothing().returning();
          voitId = voit?.id || (await db.select().from(voitures).where(eq(voitures.carId, carId)).limit(1))[0]?.id;
        } catch (e) {
          const existingV = await db.select().from(voitures).where(eq(voitures.carId, carId)).limit(1);
          voitId = existingV[0]?.id;
        }
        voitureId = voitId as number;
        if (!voitureId) continue;
        let condId: number | undefined;
        const condNin = `COND-${carId}`.slice(0,20);
        try {
          const [cond] = await db.insert(conducteurs).values({
            nin: condNin, nom: extCondNom?.slice(0,100) || "Externe", prenom: extCondPrenom?.slice(0,100) || carId.slice(0,20), telephone: extCondTel || "+213000000000", numeroPermis: extCondPermis?.slice(0,30) || "EXT", commune: "Externe", wilaya: "Externe",
          } as any).onConflictDoNothing().returning();
          condId = cond?.id || (await db.select().from(conducteurs).where(eq(conducteurs.nin, condNin)).limit(1))[0]?.id;
        } catch {
          const row = await db.select().from(conducteurs).where(eq(conducteurs.nin, condNin)).limit(1);
          condId = row[0]?.id;
        }
        if (!condId) {
          const anyCond = await db.select().from(conducteurs).where(eq(conducteurs.nom, "Externe")).limit(1);
          condId = anyCond[0]?.id;
        }
        if (!condId) continue;
        const itinId = `ext-${carId}-${sessionId}-${Date.now()}`;
        try {
          await db.insert(itineraires).values({
            itineraireId: itinId, voitureId, conducteurId: condId, sessionId,
            villeDepart: extVilleDep, villeArrivee: extVilleArr, debutAt: new Date(), statut: "en_cours",
          }).onConflictDoNothing();
        } catch {}
      } else {
        voitureId = voiture[0].id;
      }

      let itinId: number | undefined = (await db.select().from(itineraires).where(eq(itineraires.voitureId, voitureId)).orderBy(sql`${itineraires.id} DESC`).limit(1))[0]?.id;
      if (!itinId) {
        const condRow = await db.select().from(conducteurs).where(eq(conducteurs.nin, `COND-${carId}`)).limit(1);
        let condId = condRow[0]?.id;
        if (!condId) {
          try {
            const [nc] = await db.insert(conducteurs).values({ nin: `COND-${carId}`, nom: "Externe", prenom: carId, telephone: "+213000000000", numeroPermis: "EXT", commune: "Externe", wilaya: "Externe" } as any).onConflictDoNothing().returning();
            condId = nc?.id || (await db.select().from(conducteurs).where(eq(conducteurs.nin, `COND-${carId}`)).limit(1))[0]?.id;
          } catch (e) { console.error("cond insert fail", e); }
        }
        if (condId) {
          const newItinId = `ext-${carId}-${sessionId}-${Date.now()}`;
          try {
            const [ni] = await db.insert(itineraires).values({ itineraireId: newItinId, voitureId, conducteurId: condId, sessionId, villeDepart: "Externe", villeArrivee: "Externe", debutAt: new Date(), statut: "en_cours" } as any).onConflictDoNothing().returning();
            itinId = ni?.id || (await db.select().from(itineraires).where(eq(itineraires.itineraireId, newItinId)).limit(1))[0]?.id;
          } catch (e) { console.error("itin insert fail", e); }
        } else console.error("no condId for", carId);
      }
      if (!itinId) { console.error("no itinId for", carId, "voitureId", voitureId); continue; }
      // Accéléromètre du dispositif (m/s²) → km/h/s ; gyro conservé tel quel (ignoré en base)
      let accelKmhS = 0;
      const ax = Number(c.ax), ay = Number(c.ay), az = Number(c.az);
      if ([ax, ay, az].every(Number.isFinite)) {
        accelKmhS = Math.round(Math.abs(Math.sqrt(ax * ax + ay * ay + az * az) - 9.81) * 3.6 * 10) / 10;
      }
      fpRows.push({
        itineraireId: itinId,
        voitureId,
        latitude: lat, longitude: lon, altitude: 0,
        geog: { lon, lat } as any,
        vitesse: Number(c.speed ?? 30 + Math.random()*40),
        acceleration: accelKmhS, cap: Number(c.heading ?? Math.random()*360),
        carburant: Number.isFinite(fuel as number) ? (fuel as number) : null,
        distanceCumulee: 0,
        recordedAt: recAt,
        deltaSecondes: 2, statut: "en route", estInterruption: false,
      });
      liveRows.push({
        voitureId, carId, latitude: lat, longitude: lon,
        vitesse: Number(c.speed ?? 30), cap: Number(c.heading ?? 0),
        carburant: Number.isFinite(fuel as number) ? (fuel as number) : null,
        itineraireId: itinId, recordedAt: recAt, updatedAt: new Date(),
      });
      try {
        const { getSimulation } = await import("@/lib/simulationManager");
        const sim = getSimulation();
        if (sim) {
          // Itinéraire perso par véhicule si fourni (choix départ/arrivée)
          const hasCustomItin = (c as any).origin && (c as any).destination;
          let existing = sim.cars.find(cc => cc.voiture.carId === carId);
          if (!existing) {
            const newCar: any = {
              voiture: { id: voitureId, carId, proprietaire: { id: 0, nin: "EXT", type: "physique", telephone: extPropTel || "", adresse: "", commune: extPropWilaya || "Externe", wilaya: extPropWilaya || "Externe", codeWilaya: "00" } as any, immatriculation: extImmat || `EXT-${carId}`, marque: extMarque || "Externe", modele: extModele || "Sim", couleur: extCouleur || "Gris", annee: 2024, mapColor: "#ff6b35", categorieVehicule: extCat || "leger", hauteur: extH ? Number(extH) : 1.5, largeur: extL ? Number(extL) : 1.8, poids: extPoids ? Number(extPoids) : 1.2, convoiSpecial: !!extConvoi } as any,
              conducteurActuel: { id: 0, nin: `COND-${carId}`, nom: extCondNom || "Externe", prenom: extCondPrenom || carId, telephone: extCondTel || "", numeroPermis: extCondPermis || "EXT", commune: "Externe", wilaya: "Externe", profil: "normal", speed_factor: 1, a_max: 1.5, b_comfort: 2.5, reaction_time: 1 } as any,
              itineraireActuel: { id: `ext-${carId}`, voitureId, conducteur: null as any, villeDepart: extVilleDep, villeArrivee: extVilleArr, debutAt: new Date(), distanceKm: 0, vitesseMoyenne: 0, vitesseMax: 0, nombreArrets: 0, statut: "en_cours" } as any,
              lat, lon, speed: Number(c.speed ?? 30), acceleration: 0, heading: Number(c.heading ?? 0),
              distanceTraveled: 0, totalDistanceTraveled: 0, status: "en route", routePoints: [{lat, lon}], routeIndex: 0, originCity: extVilleDep, destinationCity: extVilleArr,
              needsNewRoute: false, waitTicks: 0, lastRecordTime: new Date(), consecutiveStopTicks: 0,
              currentV_ms: 0, currentV0_ms: 0, targetCruiseV_ms: 0, cruiseTimer_s: 0, isSlowingDown: false, lastAcc_ms2: 0,
              continuousDrivingSec: 0, footprintTrail: [{lat, lon, speed: Number(c.speed ?? 30), time: new Date()}],
            };
            // EXT = l'app externe est maître de la position OSM : pas de recalcul serveur
            // (sinon le serveur snappe à sa propre route et le départ ne correspond plus)
            if (hasCustomItin) {
              (newCar as any).customItinerary = { origin: (c as any).origin, destination: (c as any).destination, originName: extVilleDep, destName: extVilleArr };
              newCar.needsNewRoute = false;
            }
            sim.cars.push(newCar);
            if (!sim.footprintRecords.has(carId)) sim.footprintRecords.set(carId, []);
            sim.footprintRecords.get(carId)!.push({ itineraireId: newCar.itineraireActuel.id, carId, latitude: lat, longitude: lon, altitude: 0, vitesse: Number(c.speed ?? 30), acceleration: 0, cap: Number(c.heading ?? 0), distanceCumulee: 0, recordedAt: new Date().toISOString(), deltaSecondes: 2, statut: "en route", estInterruption: false });
          } else {
            // Nouvel itinéraire choisi dans l'externe → reset la trace (sinon l'ancien départ Hauts Plateaux reste collé)
            const itinChanged = (extOriginName && extOriginName !== existing.originCity) || (extDestName && extDestName !== existing.destinationCity);
            if (itinChanged) {
              existing.routePoints = [{ lat, lon }];
              existing.routeIndex = 0;
              existing.footprintTrail = [{ lat, lon, speed: Number(c.speed ?? 30), time: new Date() }];
              existing.distanceTraveled = 0;
              const recs0 = sim.footprintRecords.get(carId);
              if (recs0) recs0.length = 0;
            }
            existing.lat = lat; existing.lon = lon; existing.speed = Number(c.speed ?? 30); existing.heading = Number(c.heading ?? 0);
            // Mise à jour des infos véhicule si fournies
            if (extMarque) existing.voiture.marque = extMarque;
            if (extModele) existing.voiture.modele = extModele;
            if (extImmat) existing.voiture.immatriculation = extImmat;
            // Toujours afficher le nom choisi dans l'app externe
            if (extOriginName) { existing.originCity = extOriginName; existing.itineraireActuel.villeDepart = extOriginName; }
            if (extDestName) { existing.destinationCity = extDestName; existing.itineraireActuel.villeArrivee = extDestName; }
            // L'externe pousse sa position OSM : on accumule la trace, pas de recalcul serveur
            if (hasCustomItin) {
              (existing as any).customItinerary = { origin: (c as any).origin, destination: (c as any).destination, originName: extVilleDep, destName: extVilleArr };
              existing.needsNewRoute = false;
            }
            // Construit la ligne affichée sur la carte à partir des positions externes
            if (!itinChanged) {
              existing.routePoints.push({ lat, lon });
              if (existing.routePoints.length > 5000) existing.routePoints.splice(0, existing.routePoints.length - 5000);
              existing.routeIndex = Math.max(0, existing.routePoints.length - 1);
            }
            existing.footprintTrail.push({lat, lon, speed: Number(c.speed ?? 30), time: new Date()}); if (existing.footprintTrail.length>100) existing.footprintTrail.shift();
            const recs = sim.footprintRecords.get(carId);
            if (recs) recs.push({ itineraireId: existing.itineraireActuel.id, carId, latitude: lat, longitude: lon, altitude: 0, vitesse: Number(c.speed ?? 30), acceleration: 0, cap: Number(c.heading ?? 0), distanceCumulee: existing.distanceTraveled, recordedAt: new Date().toISOString(), deltaSecondes: 2, statut: "en route", estInterruption: false });
          }
        }
      } catch {}
    }

    // Batch : 2 requêtes quelle que soit la taille du lot (au lieu de 2×N)
    try {
      if (fpRows.length) {
        await db.insert(footprints).values(fpRows);
        inserted = fpRows.length;
      }
      if (liveRows.length) {
        await db.insert(vehicleCurrentPosition).values(liveRows).onConflictDoUpdate({
          target: vehicleCurrentPosition.voitureId,
          set: {
            latitude: sql`excluded."latitude"`,
            longitude: sql`excluded."longitude"`,
            vitesse: sql`excluded."vitesse"`,
            cap: sql`excluded."cap"`,
            carburant: sql`excluded."carburant"`,
            itineraireId: sql`excluded."itineraire_id"`,
            recordedAt: sql`excluded."recorded_at"`,
            updatedAt: sql`excluded."updated_at"`,
          } as any,
        });
      }
    } catch (e) {
      console.error("external track batch fail", e);
    }
    const { recordIngest } = await import("@/lib/metrics");
    recordIngest(inserted, Date.now() - t0);
    const res = NextResponse.json({ ok: true, inserted, rejected, sessionId, ingestMs: Date.now() - t0 });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    console.error("external track error", e);
    const resErr = NextResponse.json({ error: String(e), details: e.message }, { status: 500 });
    resErr.headers.set("Access-Control-Allow-Origin", "*");
    return resErr;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, usage: "POST {carId|vehicle_id, lat, lon, speed?, heading?, fuel?, recordedAt|timestamp?} ou {cars:[...], sessionId?} vers /api/external/track" }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
