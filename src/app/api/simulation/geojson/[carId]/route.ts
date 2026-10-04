import { NextRequest, NextResponse } from "next/server";
import { getCarRecords, getSimulation } from "@/lib/simulationManager";
import { carFootprintToGeoJSON } from "@/lib/simulation";

export const dynamic = "force-dynamic";

// GET - download GeoJSON file for a specific car's footprint
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ carId: string }> }
) {
  const { carId } = await params;
  const state = getSimulation();
  
  if (!state) {
    return NextResponse.json({ error: "No simulation" }, { status: 404 });
  }

  const car = state.cars.find(c => c.voiture.carId === carId);
  if (!car) {
    return NextResponse.json({ error: "Car not found" }, { status: 404 });
  }

  const geojson = carFootprintToGeoJSON(car);
  const content = JSON.stringify(geojson, null, 2);

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/geo+json",
      "Content-Disposition": `attachment; filename="${carId}-footprint.geojson"`,
    },
  });
}
