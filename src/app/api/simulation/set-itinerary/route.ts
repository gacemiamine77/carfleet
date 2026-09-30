import { NextRequest, NextResponse } from "next/server";
import { getSimulation, assignRouteForCar } from "@/lib/simulationManager";

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": "car-tracking-algeria/1.0", "Accept-Language": "fr,ar" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const addr = data.address || {};
    const name = data.name || addr.road || addr.village || addr.town || addr.city || addr.county || addr.state;
    if (name) return name;
    if (data.display_name) return data.display_name.split(",").slice(0,2).join(", ");
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  const state = getSimulation();
  if (!state) return NextResponse.json({ error: "No simulation" }, { status: 404 });
  const body = await req.json();
  const { carId, origin, destination } = body as { carId: string; origin: { lat: number; lon: number }; destination: { lat: number; lon: number } };
  if (!carId || !origin || !destination) return NextResponse.json({ error: "carId, origin, destination requis" }, { status: 400 });
  const car = state.cars.find(c => c.voiture.carId === carId);
  if (!car) return NextResponse.json({ error: "Car not found" }, { status: 404 });

  (car as any).customItinerary = { origin, destination };
  const [oName, dName] = await Promise.all([reverseGeocode(origin.lat, origin.lon), reverseGeocode(destination.lat, destination.lon)]);
  if (oName) (car as any)._customOriginName = oName;
  if (dName) (car as any)._customDestName = dName;
  const fresh = await assignRouteForCar(car, state.conducteurs);
  if ((car as any)._customOriginName) { fresh.originCity = (car as any)._customOriginName; delete (car as any)._customOriginName; }
  if ((car as any)._customDestName) { fresh.destinationCity = (car as any)._customDestName; delete (car as any)._customDestName; }
  if (dName) fresh.destinationCity = dName;
  if (oName) fresh.originCity = oName;
  Object.assign(car, fresh);
  return NextResponse.json({ ok: true, carId, origin: { lat: origin.lat, lon: origin.lon, name: oName || fresh.originCity }, destination: { lat: destination.lat, lon: destination.lon, name: dName || fresh.destinationCity } });
}
