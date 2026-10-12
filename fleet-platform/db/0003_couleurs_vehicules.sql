-- Liste des couleurs de véhicules proposées aux abonnés (modifiable depuis les réglages admin).
INSERT INTO fleet_settings(cle, valeur)
VALUES('couleurs_vehicules', '["Blanc","Noir","Gris","Argenté","Bleu","Bleu marine","Rouge","Bordeaux","Vert","Jaune","Orange","Marron","Beige","Violet"]')
ON CONFLICT (cle) DO NOTHING;
