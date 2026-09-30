import { NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";

export async function GET() {
  const state = getSimulation();
  const stops = (state?.customRoads as any)?.stops || (state as any)?.__pendingCustomRoads?.stops || [];
  const fc = { type: "FeatureCollection" as const, features: stops };
  return new NextResponse(JSON.stringify(fc, null, 2), {
    headers: {
      "Content-Type": "application/geo+json",
      "Content-Disposition": `attachment; filename="stops-${new Date().toISOString().split("T")[0]}.geojson"`,
    },
  });
}
