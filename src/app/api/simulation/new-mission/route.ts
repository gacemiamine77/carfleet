import { NextRequest, NextResponse } from "next/server";
import { getSimulation, assignRouteForCar } from "@/lib/simulationManager";

export async function POST(req: NextRequest) {
  const state = getSimulation();
  if (!state) return NextResponse.json({ error: "No simulation" }, { status: 404 });

  const { carId } = await req.json();
  const car = state.cars.find(c => c.voiture.carId === carId);

  if (car) {
    const wasRunning = state.running;
    const freshCar = await assignRouteForCar(car, state.conducteurs);
    Object.assign(car, freshCar);
    if (!wasRunning) {
      state.running = true;
      state.startedAt = Date.now();
    }
    return NextResponse.json({ ok: true, restarted: !wasRunning, carId });
  }

  return NextResponse.json({ error: "Car not found" }, { status: 404 });
}
