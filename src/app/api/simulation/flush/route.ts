import { NextResponse } from "next/server";
import { drainRecords, getSimulation } from "@/lib/simulationManager";
import { db } from "@/db";
import { 
  footprints, 
  simulationSessions, 
  proprietaires, 
  voitures, 
  conducteurs, 
  itineraires 
} from "@/db/schema";
import { eq } from "drizzle-orm";

// POST - flush buffered footprint records to database
export async function POST() {
  const state = getSimulation();
  if (!state) {
    return NextResponse.json({ error: "No simulation" }, { status: 404 });
  }

  const records = drainRecords();
  if (records.length === 0) {
    return NextResponse.json({ ok: true, flushed: 0 });
  }

  try {
    // 1. Sync Proprietaires
    for (const p of state.proprietaires) {
      await db
        .insert(proprietaires)
        .values({
          nin: p.nin,
          type: p.type,
          nom: p.nom,
          prenom: p.prenom,
          dateNaissance: p.dateNaissance ? p.dateNaissance.toISOString().split('T')[0] : null,
          raisonSociale: p.raisonSociale,
          telephone: p.telephone,
          adresse: p.adresse,
          commune: p.commune,
          wilaya: p.wilaya,
          codeWilaya: p.codeWilaya,
        })
        .onConflictDoUpdate({
          target: proprietaires.nin,
          set: { telephone: p.telephone, adresse: p.adresse },
        });
    }

    // Map NIN/CarId to DB IDs
    const dbProprietaires = await db.select().from(proprietaires);
    const propMap = new Map(dbProprietaires.map(p => [p.nin, p.id]));

    // 2. Sync Voitures
    for (const car of state.cars) {
      const v = car.voiture;
      const propId = propMap.get(v.proprietaire.nin);
      if (!propId) continue;

      try {
        await db
          .insert(voitures)
          .values({
            carId: v.carId,
            proprietaireId: propId,
            immatriculation: v.immatriculation,
            marque: v.marque,
            modele: v.modele,
            couleur: v.couleur,
            annee: v.annee,
            mapColor: v.mapColor,
            categorieVehicule: (v as any).categorieVehicule || "leger",
            hauteur: (v as any).hauteur,
            largeur: (v as any).largeur,
            poids: (v as any).poids,
            convoiSpecial: (v as any).convoiSpecial || false,
          })
          .onConflictDoNothing();
      } catch (e: any) {
        // Fallback si migration pas encore appliquée (colonne manquante)
        if (e?.code === '42703' || String(e?.message || '').includes('categorie_vehicule')) {
          await db.insert(voitures).values({
            carId: v.carId,
            proprietaireId: propId,
            immatriculation: v.immatriculation,
            marque: v.marque,
            modele: v.modele,
            couleur: v.couleur,
            annee: v.annee,
            mapColor: v.mapColor,
          } as any).onConflictDoNothing();
        } else throw e;
      }
    }

    const dbVoitures = await db.select().from(voitures);
    const voitureMap = new Map(dbVoitures.map(v => [v.carId, v.id]));

    // 3. Sync Conducteurs
    for (const c of state.conducteurs) {
      await db
        .insert(conducteurs)
        .values({
          nin: c.nin,
          nom: c.nom,
          prenom: c.prenom,
          dateNaissance: c.dateNaissance ? c.dateNaissance.toISOString().split('T')[0] : null,
          telephone: c.telephone,
          numeroPermis: c.numeroPermis,
          categoriePermis: c.categoriePermis,
          commune: c.commune,
          wilaya: c.wilaya,
        })
        .onConflictDoUpdate({
          target: conducteurs.nin,
          set: { telephone: c.telephone },
        });
    }

    const dbConducteurs = await db.select().from(conducteurs);
    const condMap = new Map(dbConducteurs.map(c => [c.nin, c.id]));

    // 4. Sync Itineraires (via historique complet, pas seulement itinéraire courant)
    const uniqueItineraries = new Set<string>();
    for (const r of records) uniqueItineraries.add(r.itineraireId);

    for (const itinId of uniqueItineraries) {
      const hist = state.itinerairesHistory.get(itinId);
      if (!hist) continue;
      const itin = hist.itineraire;
      const vId = voitureMap.get(hist.carId);
      const cId = condMap.get(itin.conducteur.nin);

      if (vId && cId) {
        await db
          .insert(itineraires)
          .values({
            itineraireId: itin.id,
            voitureId: vId,
            conducteurId: cId,
            sessionId: state.sessionId,
            villeDepart: itin.villeDepart,
            villeArrivee: itin.villeArrivee,
            debutAt: itin.debutAt,
            statut: itin.statut,
            distanceKm: itin.distanceKm,
            vitesseMax: itin.vitesseMax,
          })
          .onConflictDoUpdate({
            target: itineraires.itineraireId,
            set: { 
              statut: itin.statut, 
              distanceKm: itin.distanceKm, 
              vitesseMax: itin.vitesseMax,
              finAt: itin.finAt
            },
          });
      }
    }

    const dbItineraires = await db.select().from(itineraires);
    const itinMap = new Map(dbItineraires.map(i => [i.itineraireId, i.id]));

    // 5. Insert Footprints
    let inserted = 0;
    const footprintValues = [];

    for (const r of records) {
      const vId = voitureMap.get(r.carId);
      const iId = itinMap.get(r.itineraireId);

      if (vId && iId) {
        footprintValues.push({
          itineraireId: iId,
          voitureId: vId,
          latitude: r.latitude,
          longitude: r.longitude,
          altitude: r.altitude,
          vitesse: r.vitesse,
          acceleration: r.acceleration,
          cap: r.cap,
          distanceCumulee: r.distanceCumulee,
          recordedAt: new Date(r.recordedAt),
          deltaSecondes: r.deltaSecondes,
          statut: r.statut,
          estInterruption: r.estInterruption,
        });
      }
    }

    // Batch insert footprints
    const batchSize = 100;
    for (let i = 0; i < footprintValues.length; i += batchSize) {
      const batch = footprintValues.slice(i, i + batchSize);
      await db.insert(footprints).values(batch);
      inserted += batch.length;
    }

    // 6. Update Session
    await db
      .insert(simulationSessions)
      .values({
        sessionId: state.sessionId,
        numVoitures: state.config.numCars,
        intervalleEnregistrement: state.config.recordIntervalSec,
        seuilFlushKb: state.config.flushThresholdKb,
        seuilFlushMinutes: state.config.flushThresholdMinutes,
        totalEnregistrements: state.totalRecordsSent,
      })
      .onConflictDoUpdate({
        target: simulationSessions.sessionId,
        set: {
          totalEnregistrements: state.totalRecordsSent,
        },
      });

    return NextResponse.json({
      ok: true,
      flushed: inserted,
      totalInDb: state.totalRecordsSent,
    });
  } catch (error) {
    console.error("Flush failed:", error);
    return NextResponse.json({ error: "Database sync failed", details: String(error) }, { status: 500 });
  }
}
