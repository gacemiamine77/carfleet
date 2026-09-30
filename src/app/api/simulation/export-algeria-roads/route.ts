import { NextRequest, NextResponse } from "next/server";
import osmtogeojson from "osmtogeojson";
import { NORTH_ALGERIA_CITIES, WILAYA_CENTERS } from "@/lib/algeriaData";
import { promises as fs } from "fs";
import path from "path";
// @ts-ignore
import shpwrite from "@mapbox/shp-write";

// --- Solution originale: cache disque + réseau routier carrossable complet ---
const CACHE_DIR = path.join(process.cwd(), "public", "data", "algeria-roads");
const CAR_HIGHWAY = "motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|trunk_link|primary_link|secondary_link";

async function getCachedGeoJSON(wilayas: string[]): Promise<any | null> {
  try {
    const key = wilayas.length ? wilayas.slice().sort().join("-") : "north";
    const file = path.join(CACHE_DIR, `algeria-roads-${key}.geojson`);
    const stat = await fs.stat(file);
    const ageDays = (Date.now() - stat.mtimeMs) / 86400000;
    if (ageDays > 7) return null; // stale
    const txt = await fs.readFile(file, "utf-8");
    return JSON.parse(txt);
  } catch { return null; }
}
async function setCachedGeoJSON(wilayas: string[], gj: any) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const key = wilayas.length ? wilayas.slice().sort().join("-") : "north";
    const file = path.join(CACHE_DIR, `algeria-roads-${key}.geojson`);
    await fs.writeFile(file, JSON.stringify(gj), "utf-8");
  } catch {}
}

async function fetchOverpassData(wilayas: string[], filterExpr: string): Promise<any | null> {
  const bboxes = bboxForWilayas(wilayas);
  const ways = bboxes.map(b => `      way[${filterExpr}](${b});`).join("\n");
  const overpassQuery = `
    [out:json][timeout:90];
    (
${ways}
    );
    out geom;
  `;

  const endpoints = [
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter"
  ];

  let osmData = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "car-tracking-algeria/1.0"
        },
        signal: AbortSignal.timeout(180000)
      });
      if (!response.ok) continue;
      const text = await response.text();
      try { osmData = JSON.parse(text); if (osmData.elements?.length) break; } catch { continue; }
    } catch (err: any) { /* continue to next endpoint */ }
  }
  return osmData;
}

function bboxForWilayas(codes: string[]): string[] {
  const clean = codes.map(c => String(c).trim().padStart(2, "0"));
  const byCode = new Map<string, typeof NORTH_ALGERIA_CITIES>();
  for (const cc of clean) {
    const cities = NORTH_ALGERIA_CITIES.filter(c => String(c[3]).padStart(2, "0") === cc);
    if (cities.length) byCode.set(cc, cities);
  }
  if (byCode.size === 0 && clean.length === 0) return ["34.5,-2.2,37.1,8.7"];
  const boxes: string[] = [];
  for (const cc of clean) {
    const cities = byCode.get(cc);
    if (cities) {
      const lats = cities.map(c => c[1]), lons = cities.map(c => c[2]);
      const south = Math.min(...lats) - 0.18;
      const north = Math.max(...lats) + 0.18;
      const west = Math.min(...lons) - 0.18;
      const east = Math.max(...lons) + 0.18;
      boxes.push(`${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)}`);
    } else {
      // Wilaya 49-58 ou non listée: utilise centre approximatif ±0.6°
      const center = WILAYA_CENTERS[cc];
      if (center) boxes.push(`${(center[0]-0.6).toFixed(4)},${(center[1]-0.6).toFixed(4)},${(center[0]+0.6).toFixed(4)},${(center[1]+0.6).toFixed(4)}`);
    }
  }
  return boxes.length ? boxes : ["34.5,-2.2,37.1,8.7"];
}

function fallbackGeoJSON(codes: string[], geometry: "all" | "line" = "line") {
  const clean = codes.map(c => String(c).trim().padStart(2, "0"));
  const cities = clean.length ? NORTH_ALGERIA_CITIES.filter(c => clean.includes(String(c[3]).padStart(2, "0"))) : NORTH_ALGERIA_CITIES;
  const pts: any[] = cities.map(c => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [c[2], c[1]] },
    properties: { name: c[0], wilaya: c[4], code: c[3], highway: "fallback", note: "Point réel chef-lieu (fallback local, Overpass indisponible)" },
  }));
  const lines: any[] = [];
  const byWilaya = new Map();
  for (const cc of cities) {
    const k = cc[3];
    if (!byWilaya.has(k)) byWilaya.set(k, []);
    byWilaya.get(k).push(cc);
  }
  for (const [, arr] of byWilaya) {
    const hubIdx = arr.findIndex((c: any) => c[0] === `${arr[0][4]} Centre`);
    const hub = hubIdx !== -1 ? arr[hubIdx] : arr[0];
    const others = arr.filter((_: any, _i: number) => arr[_i] !== hub);
    for (const city of others) {
      lines.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[hub[2], hub[1]], [city[2], city[1]]] },
        properties: { name: `${hub[0]} — ${city[0]}`, highway: "fallback", wilaya: hub[4] },
      });
    }
    if (others.length > 2) {
      const sorted = [...others].sort((a: any, b: any) => a[1] - b[1]);
      for (let i = 0; i < sorted.length - 1; i++) {
        lines.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[sorted[i][2] as number, sorted[i][1] as number], [sorted[i + 1][2] as number, sorted[i + 1][1] as number]] },
          properties: { name: `${sorted[i][0]} — ${sorted[i + 1][0]} (voisin)`, highway: "fallback", wilaya: hub[4] },
        });
      }
    }
  }
  if (geometry === "line") return { type: "FeatureCollection", features: lines };
  if (geometry === "all") return { type: "FeatureCollection", features: [...pts, ...lines] };
  return { type: "FeatureCollection", features: lines };
}

async function toShapefileZip(geojson: any, filename: string): Promise<NextResponse> {
  const lineFeatures = (geojson.features || []).filter((f: any) => f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString");
  const cleaned = {
    type: "FeatureCollection" as const,
    features: lineFeatures.map((f: any) => {
      const p: any = f.properties || {};
      return {
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          name: String(p.name || "").slice(0, 80),
          name_ar: String(p.name_ar || "").slice(0, 80),
          name_fr: String(p.name_fr || "").slice(0, 80),
          highway: String(p.highway || ""),
          ref: String(p.ref || ""),
          int_ref: String(p.int_ref || ""),
          maxspeed: String(p.maxspeed || ""),
          surface: String(p.surface || ""),
          oneway: String(p.oneway || ""),
          lanes: String(p.lanes || ""),
          width: String(p.width || ""),
          bridge: String(p.bridge || ""),
          tunnel: String(p.tunnel || ""),
          junction: String(p.junction || ""),
        },
      };
    }),
  };
  // @ts-ignore
  const zipData: any = await shpwrite.zip(cleaned);
  // shp-write peut renvoyer ArrayBuffer, Uint8Array ou string selon version
  let body: any = zipData;
  if (zipData instanceof ArrayBuffer) body = Buffer.from(new Uint8Array(zipData));
  else if (zipData instanceof Uint8Array) body = Buffer.from(zipData);
  return new NextResponse(body as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}.zip"`,
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wilayasParam = searchParams.get("wilayas") || searchParams.get("wilaya") || "";
  const wilayas = wilayasParam ? wilayasParam.split(",").map(s => s.trim()).filter(Boolean).map(c => c.padStart(2, "0")) : [];
  const wantFull = searchParams.get("full") === "1"; // ?full=1 => complet lourd avec résidentielles (peut timeout sur Alger dense)
  const wantShapefile = searchParams.get("format") === "shapefile";

  // 0) Cache disque d'abord (solution originale: pas d'appel Overpass à chaque fois)
  let cached = await getCachedGeoJSON(wilayas);
  // Cache à la demande pour multi-wilayas: fusionne les caches individuels si dispo
  if (!cached && wilayas.length > 1) {
    const parts = await Promise.all(wilayas.map(c => getCachedGeoJSON([c])));
    if (parts.every(p => p && p.features?.length)) {
      const merged = { type: "FeatureCollection" as const, features: parts.flatMap(p => p!.features) };
      await setCachedGeoJSON(wilayas, merged);
      cached = merged;
    }
  }
  if (cached) {
    const suffix = wilayas.length ? `-${wilayas.join("-")}` : "-north";
    if (wantShapefile) return toShapefileZip(cached, `algeria-roads${suffix}`);
    return new NextResponse(JSON.stringify(cached, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="algeria-roads${suffix}.geojson"`,
        "X-Cache": "HIT",
      },
    });
  }

  try {
    // ============================================================
    // STEP 1: Réseau carrossable fiable (5 types) par défaut - complet seulement si ?full=1
    // ============================================================
    const filterFull = wantFull ? `["highway"~"${CAR_HIGHWAY}"]` : `["highway"~"motorway|trunk|primary|secondary|tertiary"]`;
    const osmData = await fetchOverpassData(wilayas, filterFull);

    if (osmData && osmData.elements?.length) {
      const geojson = osmtogeojson(osmData);
      if (geojson.type === "FeatureCollection") {
        geojson.features = geojson.features.map(feature => {
          const props: any = feature.properties || {};
          return {
            ...feature,
            properties: {
              name: props.name, name_ar: props["name:ar"], name_fr: props["name:fr"],
              ref: props.ref, int_ref: props.int_ref,
              highway: props.highway, junction: props.junction,
              maxspeed: props.maxspeed, minspeed: props.minspeed, maxspeed_forward: props["maxspeed:forward"], maxspeed_backward: props["maxspeed:backward"],
              surface: props.surface, smoothness: props.smoothness, tracktype: props.tracktype,
              oneway: props.oneway, lanes: props.lanes, lanes_forward: props["lanes:forward"], lanes_backward: props["lanes:backward"],
              width: props.width, lit: props.lit, bridge: props.bridge, tunnel: props.tunnel, layer: props.layer,
              access: props.access, foot: props.foot, bicycle: props.bicycle, motor_vehicle: props.motor_vehicle,
              maxheight: props.maxheight, maxwidth: props.maxwidth, maxweight: props.maxweight,
              hgv: props.hgv, hazmat: props.hazmat, goods: props.goods,
              stopping: props.stopping, parking: props.parking, no_parking: props.no_parking, no_stopping: props.no_stopping,
              "parking:lane:both": props["parking:lane:both"], "parking:lane:left": props["parking:lane:left"], "parking:lane:right": props["parking:lane:right"],
              Toll: props.toll, barrier: props.barrier, incline: props.incline,
              source: props.source, note: props.note,
            }
          };
        });
      }
      const suffix = wilayas.length ? `-${wilayas.join("-")}` : "-north";
      const out = { type: "FeatureCollection", features: geojson.features || [] } as any;
      await setCachedGeoJSON(wilayas, out);
      if (wantShapefile) return toShapefileZip(out, `algeria-roads${suffix}`);
      return new NextResponse(JSON.stringify(out, null, 2), {
        headers: {
          "Content-Type": "application/geo+json",
          "Content-Disposition": `attachment; filename="algeria-roads${suffix}.geojson"`,
          "X-Cache": "MISS",
        },
      });
    }

    // ============================================================
    // STEP 2: Fallback réseau principal si complet échoue (timeout)
    // ============================================================
    if (wantFull) {
      const osmData2 = await fetchOverpassData(wilayas, `["highway"~"motorway|trunk|primary|secondary"]`);
      if (osmData2 && osmData2.elements?.length) {
        const geojson = osmtogeojson(osmData2);
        if (geojson.type === "FeatureCollection") {
          geojson.features = geojson.features.map(feature => {
            const props: any = feature.properties || {};
            return {
              ...feature,
              properties: {
                name: props.name, name_ar: props["name:ar"], name_fr: props["name:fr"],
                ref: props.ref, int_ref: props.int_ref,
                highway: props.highway, junction: props.junction,
                maxspeed: props.maxspeed, minspeed: props.minspeed,
                surface: props.surface, smoothness: props.smoothness,
                oneway: props.oneway, lanes: props.lanes, width: props.width, lit: props.lit, bridge: props.bridge, tunnel: props.tunnel,
                access: props.access, foot: props.foot, bicycle: props.bicycle,
              },
            };
          });
        }
        const suffix = wilayas.length ? `-${wilayas.join("-")}` : "-north";
        const out = { type: "FeatureCollection", features: geojson.features || [] } as any;
        await setCachedGeoJSON(wilayas, out);
        if (wantShapefile) return toShapefileZip(out, `algeria-roads${suffix}`);
        return new NextResponse(JSON.stringify(out, null, 2), {
          headers: {
            "Content-Type": "application/geo+json",
            "Content-Disposition": `attachment; filename="algeria-roads${suffix}.geojson"`,
            "X-Cache": "MISS",
          },
        });
      }
    }

    // ============================================================
    // STEP 3: Both Overpass filters failed → ultimate fallback: local geometry
    // ============================================================
    const fb = fallbackGeoJSON(wilayas, "line");
    const suffix = wilayas.length ? `-${wilayas.join("-")}-fallback` : "-fallback";
    return new NextResponse(JSON.stringify({ type: "FeatureCollection", features: fb.features }, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="algeria-roads${suffix}.geojson"`,
        "X-Fallback": "true",
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    const fb = fallbackGeoJSON(wilayas, "line");
    const suffix = wilayas.length ? `-${wilayas.join("-")}-fallback` : "-fallback";
    return new NextResponse(JSON.stringify({ type: "FeatureCollection", features: fb.features }, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="algeria-roads${suffix}.geojson"`,
        "X-Fallback": "true",
      },
    });
  }
}