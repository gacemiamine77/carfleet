import { NextRequest, NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const state = getSimulation();
  if (!state) return NextResponse.json({ infractions: [] });
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";
  const limitParam = searchParams.get("limit");
  const carId = searchParams.get("carId");
  const infractionFilter = searchParams.get("infraction");
  const conducteurFilter = searchParams.get("conducteur");
  let list = state.infractions;
  if (carId) list = list.filter(i => i.carId === carId);
  if (infractionFilter) list = list.filter((i: any) => i.infraction === infractionFilter);
  if (conducteurFilter) list = list.filter((i: any) => i.conducteurNom === conducteurFilter);
  const sortedAll = [...list].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const sorted = limitParam ? sortedAll.slice(0, Math.max(1, Number(limitParam))) : sortedAll;

  if (format === "geojson") {
    const features: GeoJSON.Feature[] = sorted.map((inf: any) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [inf.lon, inf.lat] as [number, number] },
      properties: {
        id: inf.id,
        carId: inf.carId,
        immatriculation: inf.immatriculation,
        conducteur: inf.conducteurNom,
        infraction: inf.infraction || "exces de vitesse",
        roadName: inf.roadName,
        troncon: inf.troncon,
        restriction: inf.restriction || null,
        speed: inf.speed,
        speedLimit: inf.speedLimit,
        excess: inf.excess,
        recordedAt: inf.recordedAt,
        itineraireId: inf.itineraireId,
      },
    }));
    const gj = { type: "FeatureCollection" as const, features };
    const body = JSON.stringify(gj, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="infractions-${new Date().toISOString().split("T")[0]}.geojson"`,
      },
    });
  }

  // Statut posé par les unités (app Android) — jointure via l'id mémoire
  try {
    const { db } = await import("@/db");
    const { infractionsConstatees } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    if (sorted.length) {
      const rows = await db.select({
        externalId: infractionsConstatees.externalId, statut: infractionsConstatees.statut,
      }).from(infractionsConstatees).where(inArray(infractionsConstatees.externalId, sorted.map((i: any) => i.id)));
      const parId = new Map(rows.map((r) => [r.externalId, r.statut]));
      for (const i of sorted as any[]) i.statut = parId.get(i.id) || "nouveau";
    }
  } catch {}
  return NextResponse.json({ infractions: sorted, total: list.length });
}

export async function DELETE() {
  const state = getSimulation();
  if (!state) return NextResponse.json({ ok: false }, { status: 404 });
  state.infractions = [];
  state.lastInfractionAt.clear();
  return NextResponse.json({ ok: true, cleared: true });
}
