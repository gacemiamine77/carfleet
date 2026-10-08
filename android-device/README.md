# CarFleet GPS — App Android dispositif (Kotlin natif)

Téléphone = dispositif GPS : crée le compte propriétaire, enregistre le véhicule
(n° de série virtuel), puis envoie GPS + accéléromètre + gyroscope en continu
vers la plateforme (Render ou locale).

## Prérequis plateforme

1. Migration `drizzle/0004_device-serial.sql` appliquée (locale + Neon).
2. Serveur accessible en HTTPS (Render) ou HTTP local.

## Créer le projet / compiler l'APK

1. Ouvrir `android-device/` (le dossier avec `settings.gradle`) dans **Android Studio**.
2. Laisser Gradle synchroniser (Gradle 8.7, AGP 8.5.2, Kotlin 2.0.20).
3. `Build > Build APK(s)` → `app/build/outputs/apk/debug/app-debug.apk`.
4. Installer sur le téléphone (devient le dispositif embarqué).

## Utilisation

1. Onglet **Compte** : URL plateforme (`https://carfleet-75dh.onrender.com`),
   nom, prénom, âge, téléphone, utilisateur + mot de passe → **S'inscrire**
   (ou **Se connecter** si compte existant).
2. Onglet **Véhicule** : marque, modèle, matricule → **Enregistrer** :
   le serveur lie le **n° de série virtuel** (`VSN-…`) au véhicule.
3. Onglet **Statut** : autoriser GPS + capteurs, choisir l'intervalle
   (2/5/10/30 s — 10 s recommandé pour 1000 véhicules), **Démarrer l'envoi**.
   L'écran montre : position actuelle, accéléro/gyro live, dernier envoi
   (heure + code), état connexion, compteur. Service de premier plan :
   l'envoi continue écran éteint (notification persistante).

## Payload envoyé (POST /api/external/track)

```json
{"cars": [{
  "vehicle_id": "PROP-60-1-…", "serial": "VSN-…",
  "timestamp": "2026-09-30T13:45:20Z",
  "lat": 35.6971, "lon": -0.6308, "speed": 82, "heading": 145,
  "nom": "Benali", "prenom": "Ahmed", "age": 42,
  "marque": "Renault", "modele": "Symbol", "immatriculation": "12345-678-16",
  "ax": 0.1, "ay": -0.2, "az": 9.8, "gx": 0.01, "gy": 0.0, "gz": -0.02
}]}
```

Le serveur retrouve le véhicule par `serial`, stocke `fuel`→ n/a,
`acceleration` depuis l'accéléromètre, et dispatche les infractions aux unités.
