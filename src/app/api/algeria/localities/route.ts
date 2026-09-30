import { NextRequest, NextResponse } from "next/server";
import { NORTH_ALGERIA_CITIES, WILAYAS } from "@/lib/algeriaData";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wilayasParam = searchParams.get("wilayas") || searchParams.get("wilaya") || "";
  const wilayas = wilayasParam ? wilayasParam.split(",").map(s=>s.trim()).filter(Boolean).map(c=>c.padStart(2,"0")) : [];
  const format = searchParams.get("format") || "geojson";

  const filtered = wilayas.length
    ? NORTH_ALGERIA_CITIES.filter(c => wilayas.includes(String(c[3]).padStart(2,"0")))
    : NORTH_ALGERIA_CITIES;

  const features: GeoJSON.Feature[] = filtered.map(c => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [c[2], c[1]] } as GeoJSON.Point,
    properties: { name: c[0], wilaya: c[4], code: c[3] },
  }));

  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

  if (format === "wilayas") {
    return NextResponse.json(WILAYAS);
  }

  const suffix = wilayas.length ? `-${wilayas.join("-")}` : "";
  return new NextResponse(JSON.stringify(fc, null, 2), {
    headers: {
      "Content-Type": "application/geo+json",
      "Content-Disposition": `attachment; filename="algeria-localites${suffix}.geojson"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
