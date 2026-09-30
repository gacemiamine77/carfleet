import { NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";
import { dispatchInfractions } from "@/lib/unites";

// POST /api/unites/dispatch → pousse les infractions mémoire vers les unités (wilaya la plus proche)
export async function POST() {
  const state = getSimulation();
  const list = state?.infractions || [];
  const { inserted } = await dispatchInfractions(list as any);
  const res = NextResponse.json({ ok: true, memoire: list.length, inserted });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
