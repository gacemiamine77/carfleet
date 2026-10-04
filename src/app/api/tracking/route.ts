import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { 
  footprints, 
  simulationSessions, 
  voitures, 
  itineraires, 
  conducteurs 
} from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET - query stored tracking data (footprints joined with metadata)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const carId = searchParams.get("carId");

  const offset = (page - 1) * limit;

  try {
    // Build query with joins to get readable info
    let query = db
      .select({
        id: footprints.id,
        carId: voitures.carId,
        driverName: sql<string>`${conducteurs.prenom} || ' ' || ${conducteurs.nom}`,
        driverPhone: conducteurs.telephone,
        latitude: footprints.latitude,
        longitude: footprints.longitude,
        speed: footprints.vitesse,
        acceleration: footprints.acceleration,
        heading: footprints.cap,
        altitude: footprints.altitude,
        recordedAt: footprints.recordedAt,
        distanceTraveled: footprints.distanceCumulee,
        status: footprints.statut,
        sessionId: itineraires.sessionId,
      })
      .from(footprints)
      .innerJoin(voitures, eq(footprints.voitureId, voitures.id))
      .innerJoin(itineraires, eq(footprints.itineraireId, itineraires.id))
      .innerJoin(conducteurs, eq(itineraires.conducteurId, conducteurs.id))
      .orderBy(desc(footprints.recordedAt))
      .limit(limit)
      .offset(offset);

    if (carId) {
      query = query.where(eq(voitures.carId, carId)) as typeof query;
    }

    const records = await query;

    // Get total count
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(footprints);
    const total = Number(countResult[0]?.count ?? 0);

    // Get sessions
    const sessions = await db
      .select()
      .from(simulationSessions)
      .orderBy(desc(simulationSessions.createdAt))
      .limit(20);

    return NextResponse.json({
      records,
      total,
      page,
      limit,
      sessions,
    });
  } catch (error) {
    console.error("Error fetching tracking data:", error);
    return NextResponse.json({
      records: [],
      total: 0,
      error: "Database query failed",
    }, { status: 500 });
  }
}
