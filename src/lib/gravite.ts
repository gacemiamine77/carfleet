// Score de gravité CANONIQUE — même formule partout :
// API (/api/unites/infractions), plateforme (MapView, MiniMap, Véhicules), app Android.
// Niveaux : grave ≥ 80, moyen ≥ 50, faible < 50.
export function scoreGravite(infraction: string, exces?: number | null): number {
  switch (infraction) {
    case "circulation à contresens": return 100;
    case "zone interdite": return 80;
    case "conduite longue sans arrêt": return 50;
    case "exces de vitesse": return 40 + Math.min(Number(exces) || 0, 60);
    case "arrêt interdit":
    case "stationnement interdit": return 30;
    case "impossible de comparée": return 10;
    default: return 20;
  }
}

export type NiveauGravite = "grave" | "moyen" | "faible";

export function niveauGravite(infraction: string, exces?: number | null): NiveauGravite {
  const s = scoreGravite(infraction, exces);
  if (s >= 80) return "grave";
  if (s >= 50) return "moyen";
  return "faible";
}

/** À traiter en priorité (grave OU moyen) — ex-predicat estGrave des véhicules. */
export function prioritaire(infraction: string, exces?: number | null): boolean {
  return scoreGravite(infraction, exces) >= 50;
}
