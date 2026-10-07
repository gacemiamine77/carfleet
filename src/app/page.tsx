"use client";

import { useEffect, useState } from "react";

interface Health { ok?: boolean; [k: string]: any }

const CARDS = [
  {
    href: "/plateforme",
    emoji: "🖥️",
    titre: "Plateforme",
    sous: "Opérateur",
    desc: "Suivi flotte temps réel, carte Algérie, simulations, infractions, unités, registre des inscrites.",
    cta: "Ouvrir la plateforme",
    color: "from-emerald-700 to-teal-600",
  },
  {
    href: "/proprietaires-app/index.html",
    emoji: "🚗",
    titre: "Espace Propriétaires",
    sous: "Propriétaires & chauffeurs",
    desc: "Inscription, mes véhicules, désignation du chauffeur, kilométrage par jour / mois / période.",
    cta: "Espace propriétaires",
    color: "from-green-700 to-emerald-500",
  },
  {
    href: "/security-units-app/index.html",
    emoji: "🚓",
    titre: "Unités de sécurité",
    sous: "Police & Gendarmerie",
    desc: "Alertes du territoire, carte, interception avec ETA, traitement notifié / traité.",
    cta: "App unités",
    color: "from-blue-800 to-blue-500",
  },
  {
    href: "/external-app/index.html",
    emoji: "📡",
    titre: "App externe",
    sous: "Simulateur dispositifs",
    desc: "Simule des dispositifs GPS (itinéraires OSM réels, ×1 à ×60) envoyés vers la plateforme.",
    cta: "Simulateur externe",
    color: "from-indigo-700 to-violet-500",
  },
];

export default function Accueil() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unites, setUnites] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    fetch("/api/unites").then((r) => r.json()).then((d) => setUnites(d.total ?? (d.unites || []).length)).catch(() => setUnites(null));
  }, []);

  return (
    <div className="min-h-screen w-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white overflow-auto">
      <header className="max-w-5xl mx-auto px-6 pt-10 pb-6 text-center">
        <div className="text-5xl mb-2">🇩🇿</div>
        <h1 className="text-3xl font-bold tracking-tight">Suivi de Flotte — Algérie</h1>
        <p className="text-slate-300 mt-1 text-sm">
          Plateforme nationale : véhicules connectés, propriétaires, sécurité routière
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-xs bg-white/10 rounded-full px-3 py-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${health ? (health.ok ? "bg-green-400" : "bg-red-400") : "bg-yellow-400 animate-pulse"}`} />
          {health ? (health.ok ? "Système en ligne" : "Système injoignable") : "Vérification…"}
          {unites != null && health?.ok && <span className="text-slate-300">· {unites} unités</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-12 grid grid-cols-1 md:grid-cols-2 gap-4">
        {CARDS.map((c) => (
          <a key={c.href} href={c.href}
            className={`rounded-2xl p-5 bg-gradient-to-br ${c.color} shadow-lg hover:shadow-2xl hover:scale-[1.01] transition-all block`}>
            <div className="text-4xl">{c.emoji}</div>
            <div className="text-xs uppercase tracking-wide opacity-80 mt-2">{c.sous}</div>
            <div className="text-xl font-bold">{c.titre}</div>
            <p className="text-sm opacity-90 mt-1">{c.desc}</p>
            <div className="mt-3 inline-block bg-white/20 rounded-lg px-3 py-1.5 text-sm font-semibold">{c.cta} →</div>
          </a>
        ))}
      </main>

      <footer className="max-w-5xl mx-auto px-6 pb-8 text-center text-xs text-slate-400">
        <div className="bg-white/5 rounded-xl px-4 py-3 inline-block">
          📱 <b>App Android (unités)</b> : installez l’APK <i>SR Units</i>, URL = adresse de ce serveur
          (ex. <span className="font-mono">https://carfleet-75dh.onrender.com</span>), puis identifiants de l’unité.
        </div>
      </footer>
    </div>
  );
}
