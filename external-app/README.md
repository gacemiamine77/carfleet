# App externe — Simulation 5 voitures

Envoie des positions aléatoires vers la plateforme principale. Les données sont sauvées directement en base et s'affichent sur la carte.

## 1. Configurer la plateforme

Dans `car-tracking` lancez :

```
npm run dev
```

Notez l'IP affichée : `http://192.168.0.2:3000` (exemple). Testez `http://VOTRE_IP:3000/api/external/track` doit répondre `{"ok":true}`.

Ouvrez le pare-feu Windows : `Pare-feu > Autoriser une application > Node.js`.

## 2. Lancer l'app externe depuis un autre ordinateur

### Option A — Python (recommandé)

```bash
pip install requests
python simulate.py --url http://192.168.0.2:3000 --interval 2
```

### Option B — Node

```bash
npm install node-fetch@2
node simulate.js --url http://192.168.0.2:3000 --interval 2
```

### Option C — Navigateur (sans installation)

Ouvrez `index.html` dans Chrome (double-clic), renseignez `http://192.168.0.2:3000` et cliquez `Start`.

## 3. Vérifier

- Carte `🗺️` : 5 voitures oranges `EXT-1` … `EXT-5` apparaissent en direct
- `GET /api/external/track` → infos
- Base `GET /api/tracking?carId=EXT-1` → points sauvegardés, exportables comme la flotte principale

Données aléatoires acceptées (pas besoin de suivre une route OSM) — `carId, lat, lon` suffisent, `speed/heading` optionnels.
