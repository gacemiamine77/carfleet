// Compteurs légers en mémoire (observabilité charge) — remis à zéro au redémarrage.
// Permet de voir QUAND l'architecture actuelle sature (tick qui s'allonge, ingestion/s).
const bootAt = Date.now();
const tickMs: number[] = [];
let totalTicks = 0;
let totalIngested = 0;
let totalIngestMs = 0;

export function recordTick(ms: number) {
  totalTicks++;
  tickMs.push(ms);
  if (tickMs.length > 60) tickMs.shift();
}

export function recordIngest(count: number, ms: number) {
  totalIngested += count;
  totalIngestMs += ms;
}

export function getMetrics() {
  const avgTick = tickMs.length ? Math.round(tickMs.reduce((a, b) => a + b, 0) / tickMs.length) : 0;
  const lastTick = tickMs.length ? Math.round(tickMs[tickMs.length - 1]) : 0;
  const upSec = Math.round((Date.now() - bootAt) / 1000);
  return {
    uptimeSec: upSec,
    totalTicks,
    lastTickMs: lastTick,
    avgTickMs60: avgTick,
    totalIngested,
    ingestPerSec: upSec > 0 ? Math.round((totalIngested / upSec) * 10) / 10 : 0,
    avgIngestMs: totalIngested > 0 ? Math.round(totalIngestMs / totalIngested) : 0,
  };
}
