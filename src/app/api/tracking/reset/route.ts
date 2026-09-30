import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// POST - delete all tracking data from database
export async function POST() {
  try {
    // Delete in correct order to respect foreign keys
    // 1. Delete footprints first (child of voitures and itineraires)
    await db.execute(sql`DELETE FROM footprints`);
    
    // 2. Delete itineraires (child of voitures and conducteurs)
    await db.execute(sql`DELETE FROM itineraires`);
    
    // 3. Delete simulation sessions
    await db.execute(sql`DELETE FROM simulation_sessions`);
    
    // 4. Delete voitures, conducteurs, proprietaires
    await db.execute(sql`DELETE FROM voitures`);
    await db.execute(sql`DELETE FROM conducteurs`);
    await db.execute(sql`DELETE FROM proprietaires`);
    
    // Reset sequences if needed (optional, for cleaner IDs)
    await db.execute(sql`ALTER SEQUENCE footprints_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE itineraires_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE voitures_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE conducteurs_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE proprietaires_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE simulation_sessions_id_seq RESTART WITH 1`);

    return NextResponse.json({ 
      ok: true, 
      message: "Base de données complètement vidée. Toutes les tables ont été réinitialisées." 
    });
  } catch (error: any) {
    console.error("Reset error:", error);
    return NextResponse.json({ 
      error: "Erreur lors de la réinitialisation", 
      details: error.message 
    }, { status: 500 });
  }
}
