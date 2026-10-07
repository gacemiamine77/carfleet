#!/usr/bin/env python3
"""
App externe - simule 5 voitures avec positions aléatoires en Algérie et envoie vers la plateforme.
Usage: python simulate.py --url https://carfleet-75dh.onrender.com --interval 2
"""
import argparse, time, random, requests, sys

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="https://carfleet-75dh.onrender.com", help="URL de la plateforme, ex: https://carfleet-75dh.onrender.com")
parser.add_argument("--interval", type=float, default=2.0, help="secondes entre envois")
parser.add_argument("--session", default=None, help="sessionId optionnel")
args = parser.parse_args()

base = args.url.rstrip("/")
endpoint = f"{base}/api/external/track"
print(f"Envoi vers {endpoint} toutes les {args.interval}s — Ctrl+C pour arrêter")

# 5 voitures autour du nord Algérie
cars = [
    {"carId": f"EXT-{i+1}", "lat": 36.75 + random.uniform(-1.5, 1.5), "lon": 3.04 + random.uniform(-2.5, 2.5), "heading": random.uniform(0,360)}
    for i in range(5)
]

session = args.session or f"external-{int(time.time())}"

try:
    while True:
        payload_cars = []
        for c in cars:
            # déplacement aléatoire ~30-60 km/h
            speed = random.uniform(20, 70)
            heading = (c["heading"] + random.uniform(-25, 25)) % 360
            # ~ speed km/h * interval / 111km per degree
            dist_deg = (speed * args.interval / 3600) / 111
            import math
            c["lat"] += math.cos(math.radians(heading)) * dist_deg * 0.7
            c["lon"] += math.sin(math.radians(heading)) * dist_deg * 0.7 / max(0.5, abs(math.cos(math.radians(c["lat"]))))
            c["heading"] = heading
            # clamp Nord Algérie
            c["lat"] = max(32.5, min(37.5, c["lat"]))
            c["lon"] = max(-2.5, min(9.0, c["lon"]))
            payload_cars.append({"carId": c["carId"], "lat": round(c["lat"],5), "lon": round(c["lon"],5), "speed": round(speed,1), "heading": round(heading,1)})

        try:
            r = requests.post(endpoint, json={"cars": payload_cars, "sessionId": session}, timeout=5)
            print(f"[{time.strftime('%H:%M:%S')}] {r.status_code} {r.text[:120]}")
            if r.status_code != 200:
                print("  Vérifiez que la plateforme est lancée et que l'URL est correcte")
        except Exception as e:
            print(f"Erreur réseau: {e} — vérifiez l'IP et le pare-feu")

        time.sleep(args.interval)
except KeyboardInterrupt:
    print("\nArrêt")
    sys.exit(0)
