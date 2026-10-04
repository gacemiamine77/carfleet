import { NextRequest, NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";
import type { SpeedProfilePoint } from "@/lib/simulation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const state = getSimulation();
  if (!state) return NextResponse.json({ error: "No simulation" }, { status: 404 });
  const body = await req.json();
  const { carId, profile } = body as { carId: string; profile: SpeedProfilePoint[] | null };

  if (!carId) return NextResponse.json({ error: "carId requis" }, { status: 400 });

  const car = state.cars.find(c => c.voiture.carId === carId);
  if (!car) return NextResponse.json({ error: "Car not found" }, { status: 404 });

  if (profile === null) {
    car.customSpeedProfile = null;
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (!Array.isArray(profile) || profile.length < 2) {
    return NextResponse.json({ error: "profile doit avoir >=2 points {pct,speedKmh}" }, { status: 400 });
  }

  // validation + tri + clamp (170 km/h max demandé)
  const cleaned: SpeedProfilePoint[] = profile
    .map(p => ({ pct: Math.max(0, Math.min(100, Number(p.pct))), speedKmh: Math.max(0, Math.min(170, Number(p.speedKmh))) }))
    .sort((a, b) => a.pct - b.pct);

  car.customSpeedProfile = cleaned;
  return NextResponse.json({ ok: true, profile: cleaned });
}

export async function GET(req: NextRequest) {
  const state = getSimulation();
  if (!state) return NextResponse.json({ error: "No simulation" }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const carId = searchParams.get("carId");
  if (!carId) return NextResponse.json({ profiles: state.cars.map(c => ({ carId: c.voiture.carId, profile: c.customSpeedProfile ?? null })) });
  const car = state.cars.find(c => c.voiture.carId === carId);
  if (!car) return NextResponse.json({ error: "Car not found" }, { status: 404 });
  return NextResponse.json({ carId, profile: car.customSpeedProfile ?? null });
}
