# SR Units DZ — App Android (Kotlin natif) des forces de sécurité

Affiche **uniquement les infractions du territoire de l'unité connectée**
(compte par unité, territoire imposé côté serveur).

## 1. Créer les comptes unités (côté plateforme)

```bash
curl -X POST https://<serveur>/api/unites/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"gnd16-mob","password":"motdepasse-solide","uniteCode":"GND-MOB-16"}'
```

## 2. Compiler l'APK

1. Ouvrir **ce dossier** (la racine, celle qui contient `settings.gradle`) dans **Android Studio** (Ladybug+).
2. Laisser Gradle synchroniser. Le wrapper est réglé sur **Gradle 8.7**, la version supportée par AGP 8.5.2.
   `gradlew` / `gradle-wrapper.jar` ne sont pas fournis : Android Studio les utilise en interne ;
   pour la ligne de commande, lancer une fois `gradle wrapper` (Gradle installé) ou copier ceux d'un autre projet.
3. `Build > Build APK(s)` → `app-debug.apk`, ou `Generate Signed Bundle` pour diffusion.

## 3. Réseau : HTTPS obligatoire

Le trafic HTTP en clair est **interdit** (`res/xml/network_security_config.xml`), sauf pour l'hôte de test `192.168.0.2`.
**En production : serveur en HTTPS et suppression du bloc `domain-config`.**
Pour tester sur une autre IP locale, ajouter son adresse dans ce même bloc.

## 4. Utilisation

- L'agent saisit **URL plateforme + identifiants** → l'app affiche wilaya/corps/dispositif de son unité.
- **Alertes / Carte / Stats / Traitement** : rafraîchies toutes les 5 s **tant que l'écran est visible** (15 s si hors-ligne).
- **Traitement** : « ✔ Traité » envoie le statut au serveur. **Hors-ligne, le changement est mis en file d'attente**
  (table Room `pending_statuts`) et rejoué à la reconnexion ; l'affichage ne revient pas en arrière entre-temps.
- **Session expirée (401 ou `expiresAt` dépassé)** : retour automatique à l'écran de connexion.
- **Déconnexion** : efface session, cache Room et données en mémoire (aucune donnée d'une unité n'est visible par la suivante).
- **Hors-ligne** : bandeau ⚠️ + cache Room.

## 5. Sécurité

- Token stocké dans des `EncryptedSharedPreferences` (Android Keystore). L'ancien stockage en clair est supprimé au premier lancement.
- `allowBackup=false`, permissions de localisation retirées (non utilisées).
- Journal réseau OkHttp uniquement en debug.
- **Non traité** : la base Room (plaques, noms, positions) n'est pas chiffrée (SQLCipher possible), pas de certificate pinning,
  pas de minification R8 en release (nécessite des règles Gson/Retrofit à tester).

## 6. Carte

Tuiles CARTO Voyager + cache osmdroid, attribution affichée. Vérifier les conditions d'usage de CARTO pour un usage institutionnel
(ou héberger ses propres tuiles).

## Structure

- `api/` : Retrofit (`ApiService`, `ApiClient`), modèles JSON.
- `data/` : `SessionManager` (chiffré), Room (`cached_infractions`, `cached_unites`, `pending_statuts`), `Repository` (réseau → cache, file d'attente).
- `ui/` : Login, Map (osmdroid), Alerts, Stats, Treatment, Unit + `SharedViewModel`.
