import { NextRequest, NextResponse } from "next/server";
import { getSimulation, setPendingCustomRoads } from "@/lib/simulationManager";

// Augmenter la limite de taille pour l'API (spécifique à certains environnements)
export const maxDuration = 60; // 60 secondes de traitement

export async function POST(req: NextRequest) {
  const state = getSimulation();

  try {
    const geojson = await req.json();

    if (!geojson.features || !Array.isArray(geojson.features)) {
      return NextResponse.json({ error: "Invalid GeoJSON: features array expected" }, { status: 400 });
    }

    const roadsOnly = geojson.features.filter(
      (f: any) => f.geometry && f.geometry.type === "LineString"
    );
    const stopsOnly = geojson.features.filter(
      (f: any) => f.geometry && f.geometry.type === "Point" && (f.properties?.highway === "stop" || f.properties?.traffic_sign === "stop")
    );

    if (roadsOnly.length === 0) {
      return NextResponse.json({ error: "GeoJSON must contain at least one LineString" }, { status: 400 });
    }

    const net: any = { features: roadsOnly };
    if (stopsOnly.length) (net as any).stops = stopsOnly;

    if (state) {
      state.customRoads = net;
      for (const car of state.cars) {
        car.needsNewRoute = true;
        car.routePoints = [];
        car.routeIndex = 0;
      }
    } else {
      setPendingCustomRoads(net);
    }

    return NextResponse.json({
      ok: true,
      segments: roadsOnly.length,
      message: state ? "Custom road network loaded successfully" : "Custom road network en attente — sera utilisé au prochain démarrage",
      pending: !state,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to parse GeoJSON" }, { status: 400 });
  }
}
