"use client";
import { useRef, useState, useEffect, useCallback } from "react";

type Pt = { pct: number; speedKmh: number };

interface Props {
  carId: string;
  color: string;
  initialProfile?: Pt[] | null;
  onClose?: () => void;
}

const W = 520, H = 180, PAD_L = 40, PAD_R = 10, PAD_T = 10, PAD_B = 24;

function toCanvas(p: Pt): { x: number; y: number } {
  const x = PAD_L + (p.pct / 100) * (W - PAD_L - PAD_R);
  const y = PAD_T + (1 - p.speedKmh / 170) * (H - PAD_T - PAD_B);
  return { x, y };
}
function toProfile(x: number, y: number): Pt {
  const pct = Math.max(0, Math.min(100, ((x - PAD_L) / (W - PAD_L - PAD_R)) * 100));
  const speedKmh = Math.max(0, Math.min(170, (1 - (y - PAD_T) / (H - PAD_T - PAD_B)) * 170));
  return { pct, speedKmh: Math.round(speedKmh) };
}

export default function SpeedProfileEditor({ carId, color, initialProfile, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pts, setPts] = useState<Pt[]>(
    initialProfile && initialProfile.length >= 2
      ? initialProfile
      : [{ pct: 0, speedKmh: 0 }, { pct: 15, speedKmh: 50 }, { pct: 50, speedKmh: 90 }, { pct: 85, speedKmh: 40 }, { pct: 100, speedKmh: 0 }]
  );
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [textMode, setTextMode] = useState(false);
  const [textVal, setTextVal] = useState("");

  const ptsToText = (arr: Pt[]) => arr.map(p => `${Math.round(p.pct)}:${p.speedKmh}`).join(" → ");
  const textToPts = (txt: string): Pt[] | null => {
    try {
      // Accepte "0-5%:80 → 5-15%:90" ou "0:80 → 5:80 → 15:90" ou "0:0, 5:80; 15:90"
      const parts = txt.split(/→|;|,|\n/).map(s=>s.trim()).filter(Boolean);
      const out: Pt[] = [];
      for (const part of parts) {
        // Gère "0-5%:80" ou "5%:80" ou "5:80"
        const m = part.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?)\s*)?%?\s*:\s*(\d+)/);
        if (!m) continue;
        const a = parseFloat(m[1]), b = m[2] ? parseFloat(m[2]) : null, speed = parseInt(m[3],10);
        if (b != null) {
          // Plage a-b : crée 2 points
          out.push({ pct: Math.max(0,Math.min(100,a)), speedKmh: Math.max(0,Math.min(170,speed)) });
          out.push({ pct: Math.max(0,Math.min(100,b)), speedKmh: Math.max(0,Math.min(170,speed)) });
        } else {
          out.push({ pct: Math.max(0,Math.min(100,a)), speedKmh: Math.max(0,Math.min(170,speed)) });
        }
      }
      const sorted = out.sort((x,y)=>x.pct-y.pct);
      // Déduplique pct proches
      const dedup: Pt[] = [];
      for (const q of sorted) if (!dedup.length || Math.abs(q.pct - dedup[dedup.length-1].pct) > 0.5 || q.speedKmh !== dedup[dedup.length-1].speedKmh) dedup.push(q);
      if (dedup.length < 2) return null;
      if (dedup[0].pct > 0.5) dedup.unshift({ pct: 0, speedKmh: dedup[0].speedKmh });
      if (dedup[dedup.length-1].pct < 99.5) dedup.push({ pct: 100, speedKmh: dedup[dedup.length-1].speedKmh });
      return dedup.slice(0, 24);
    } catch { return null; }
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for (let s = 0; s <= 170; s += 30) {
      const y = PAD_T + (1 - s / 170) * (H - PAD_T - PAD_B);
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.fillStyle = "#9ca3af"; ctx.font = "10px sans-serif"; ctx.fillText(`${s}`, 4, y + 3);
    }
    for (let p = 0; p <= 100; p += 20) {
      const x = PAD_L + (p / 100) * (W - PAD_L - PAD_R);
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, H - PAD_B); ctx.stroke();
      ctx.fillStyle = "#9ca3af"; ctx.fillText(`${p}%`, x - 8, H - 4);
    }
    // axes labels
    ctx.fillStyle = "#6b7280"; ctx.font = "11px sans-serif"; ctx.fillText("km/h", 6, PAD_T - 2);
    // profile
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.beginPath();
    pts.forEach((p, i) => {
      const { x, y } = toCanvas(p);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // fill under
    ctx.lineTo(toCanvas(pts[pts.length - 1]).x, H - PAD_B); ctx.lineTo(toCanvas(pts[0]).x, H - PAD_B); ctx.closePath();
    ctx.fillStyle = color + "22"; ctx.fill();
    // handles
    pts.forEach(p => {
      const { x, y } = toCanvas(p);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    });
  }, [pts, color]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { if (!textMode) setTextVal(ptsToText(pts)); }, [pts, textMode]);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    const p = toProfile(x, y);
    // insère trié par pct
    setPts(prev => {
      const next = [...prev, p].sort((a, b) => a.pct - b.pct);
      // déduplique pct proches <2%
      const dedup: Pt[] = [];
      for (const q of next) if (!dedup.length || Math.abs(q.pct - dedup[dedup.length - 1].pct) > 1.5) dedup.push(q);
      // force 0% et 100%
      if (dedup[0].pct > 2) dedup.unshift({ pct: 0, speedKmh: 0 });
      if (dedup[dedup.length - 1].pct < 98) dedup.push({ pct: 100, speedKmh: 0 });
      return dedup.slice(0, 24);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/simulation/speed-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carId, profile: pts }),
      });
      const data = await res.json();
      if (data.ok) setMsg("✅ Profil appliqué");
      else setMsg(data.error || "Erreur");
    } catch { setMsg("Erreur réseau"); }
    setSaving(false);
    setTimeout(() => setMsg(""), 2000);
  };

  const handleClear = async () => {
    setPts([{ pct: 0, speedKmh: 0 }, { pct: 100, speedKmh: 0 }]);
    await fetch("/api/simulation/speed-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ carId, profile: null }) });
    setMsg("🗑️ Profil effacé (IDM)");
    setTimeout(() => setMsg(""), 1500);
  };

  return (
    <div className="bg-white border rounded-xl p-3 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold" style={{ color }}>✏️ Croquis vitesse — {carId}</div>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>}
      </div>
      <div className="text-[11px] text-gray-500">Dessine à la main : clique/glisse sur le graphe. X = % trajet, Y = km/h (0-170). Le véhicule suivra ce croquis.</div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full border rounded-lg bg-gray-50 touch-none cursor-crosshair"
        style={{ maxWidth: "100%" }}
        onPointerDown={e => { setDrawing(true); (e.target as Element).setPointerCapture(e.pointerId); handlePointer(e); }}
        onPointerMove={e => { if (drawing) handlePointer(e); }}
        onPointerUp={() => setDrawing(false)}
        onPointerLeave={() => setDrawing(false)}
      />
      <div className="flex items-center gap-2">
        <button onClick={()=>setTextMode(!textMode)} className="text-[11px] text-blue-600 underline">{textMode ? "✏️ Croquis" : "📝 Texte"}</button>
        <span className="text-[11px] text-gray-400">Ex: 0-5:80 → 5-15:90 → 15-60:110 → 60-65:170 → 65-90:60 → 90-100:30 → 100:0 (accélération régulière)</span>
      </div>
      {textMode && (
        <textarea value={textVal} onChange={e=>setTextVal(e.target.value)} onBlur={()=>{
          const parsed=textToPts(textVal);
          if (parsed) { setPts(parsed); setMsg("✅ Texte appliqué"); setTimeout(()=>setMsg(""),1500); }
          else setMsg("❌ Format invalide — ex: 0:0 → 5:80 → 15:90 → 60:110");
        }} rows={3} className="w-full border rounded-lg p-2 text-xs font-mono bg-gray-50" placeholder="0:0 → 5:80 → 15:90 → 60:110 → 65:170 → 90:30 → 100:0" />
      )}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
          {saving ? "…" : "💾 Appliquer"}
        </button>
        <button onClick={handleClear} className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-1.5 rounded-lg">Effacer</button>
        <button onClick={() => setPts([{ pct: 0, speedKmh: 0 }, { pct: 15, speedKmh: 50 }, { pct: 50, speedKmh: 90 }, { pct: 85, speedKmh: 40 }, { pct: 100, speedKmh: 0 }])} className="px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs py-1.5 rounded-lg">↺ Exemple</button>
      </div>
      {msg && <div className="text-xs text-center text-emerald-600 font-medium">{msg}</div>}
      <div className="text-[10px] text-gray-400 font-mono max-h-12 overflow-auto">{pts.map(p => `${Math.round(p.pct)}%:${p.speedKmh}`).join(" → ")}</div>
    </div>
  );
}
