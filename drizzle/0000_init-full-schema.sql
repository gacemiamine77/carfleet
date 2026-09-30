CREATE TYPE "public"."owner_type" AS ENUM('physique', 'morale');--> statement-breakpoint
CREATE TYPE "public"."statut_alerte" AS ENUM('nouveau', 'notifie', 'traite');--> statement-breakpoint
CREATE TYPE "public"."type_unite" AS ENUM('police', 'gendarmerie');--> statement-breakpoint
CREATE TABLE "comptes_unites" (
	"id" serial PRIMARY KEY NOT NULL,
	"unite_id" integer NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"actif" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "comptes_unites_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "conducteurs" (
	"id" serial PRIMARY KEY NOT NULL,
	"nin" varchar(20) NOT NULL,
	"nom" varchar(100) NOT NULL,
	"prenom" varchar(100) NOT NULL,
	"date_naissance" date,
	"telephone" varchar(32) NOT NULL,
	"numero_permis" varchar(30),
	"categorie_permis" varchar(10),
	"date_delivrance_permis" date,
	"adresse" text,
	"commune" varchar(100),
	"wilaya" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "conducteurs_nin_unique" UNIQUE("nin")
);
--> statement-breakpoint
CREATE TABLE "footprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"itineraire_id" integer NOT NULL,
	"voiture_id" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"altitude" double precision DEFAULT 0,
	"vitesse" double precision NOT NULL,
	"acceleration" double precision NOT NULL,
	"cap" double precision NOT NULL,
	"distance_cumulee" double precision DEFAULT 0,
	"recorded_at" timestamp with time zone NOT NULL,
	"delta_secondes" integer,
	"statut" varchar(16) DEFAULT 'moving' NOT NULL,
	"est_interruption" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "infractions_constatees" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"car_id" varchar(64),
	"immatriculation" varchar(20),
	"conducteur_nom" varchar(200),
	"categorie_vehicule" varchar(30),
	"infraction" varchar(60) NOT NULL,
	"restriction" text,
	"road_name" varchar(255),
	"troncon" varchar(255),
	"vitesse" double precision,
	"vitesse_limite" double precision,
	"exces" double precision,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"code_wilaya" varchar(4),
	"wilaya" varchar(100),
	"unite_id" integer,
	"statut" "statut_alerte" DEFAULT 'nouveau' NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "infractions_constatees_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "itineraires" (
	"id" serial PRIMARY KEY NOT NULL,
	"itineraire_id" varchar(64) NOT NULL,
	"voiture_id" integer NOT NULL,
	"conducteur_id" integer NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"ville_depart" varchar(100),
	"ville_arrivee" varchar(100),
	"debut_at" timestamp with time zone NOT NULL,
	"fin_at" timestamp with time zone,
	"duree_minutes" integer,
	"distance_km" double precision DEFAULT 0,
	"vitesse_moyenne" double precision,
	"vitesse_max" double precision,
	"nombre_arrets" integer DEFAULT 0,
	"statut" varchar(20) DEFAULT 'en_cours' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "itineraires_itineraire_id_unique" UNIQUE("itineraire_id")
);
--> statement-breakpoint
CREATE TABLE "proprietaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"nin" varchar(20) NOT NULL,
	"type" "owner_type" DEFAULT 'physique' NOT NULL,
	"nom" varchar(100),
	"prenom" varchar(100),
	"date_naissance" date,
	"raison_sociale" varchar(200),
	"telephone" varchar(32) NOT NULL,
	"adresse" text,
	"commune" varchar(100),
	"wilaya" varchar(100),
	"code_wilaya" varchar(4),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "proprietaires_nin_unique" UNIQUE("nin")
);
--> statement-breakpoint
CREATE TABLE "sessions_unites" (
	"token" varchar(96) PRIMARY KEY NOT NULL,
	"compte_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "simulation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"num_voitures" integer NOT NULL,
	"intervalle_enregistrement" integer NOT NULL,
	"seuil_flush_kb" integer NOT NULL,
	"seuil_flush_minutes" integer NOT NULL,
	"total_enregistrements" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"notes" text,
	CONSTRAINT "simulation_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "unites_securite" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"nom" varchar(200) NOT NULL,
	"type" "type_unite" NOT NULL,
	"code_wilaya" varchar(4) NOT NULL,
	"wilaya" varchar(100) NOT NULL,
	"moyen" varchar(30) DEFAULT 'poste_fixe' NOT NULL,
	"mobile" boolean DEFAULT false,
	"latitude" double precision,
	"longitude" double precision,
	"telephone" varchar(32),
	"actif" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unites_securite_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "voitures" (
	"id" serial PRIMARY KEY NOT NULL,
	"car_id" varchar(64) NOT NULL,
	"proprietaire_id" integer NOT NULL,
	"immatriculation" varchar(20) NOT NULL,
	"marque" varchar(50),
	"modele" varchar(50),
	"couleur" varchar(30),
	"annee" integer,
	"type_carburant" varchar(20),
	"categorie_vehicule" varchar(30) DEFAULT 'leger' NOT NULL,
	"hauteur" double precision,
	"largeur" double precision,
	"poids" double precision,
	"convoi_special" boolean DEFAULT false,
	"map_color" varchar(10) DEFAULT '#3498db' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "voitures_car_id_unique" UNIQUE("car_id"),
	CONSTRAINT "voitures_immatriculation_unique" UNIQUE("immatriculation")
);
--> statement-breakpoint
ALTER TABLE "comptes_unites" ADD CONSTRAINT "comptes_unites_unite_id_unites_securite_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_securite"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "footprints" ADD CONSTRAINT "footprints_itineraire_id_itineraires_id_fk" FOREIGN KEY ("itineraire_id") REFERENCES "public"."itineraires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "footprints" ADD CONSTRAINT "footprints_voiture_id_voitures_id_fk" FOREIGN KEY ("voiture_id") REFERENCES "public"."voitures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD CONSTRAINT "infractions_constatees_unite_id_unites_securite_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_securite"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraires" ADD CONSTRAINT "itineraires_voiture_id_voitures_id_fk" FOREIGN KEY ("voiture_id") REFERENCES "public"."voitures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraires" ADD CONSTRAINT "itineraires_conducteur_id_conducteurs_id_fk" FOREIGN KEY ("conducteur_id") REFERENCES "public"."conducteurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_unites" ADD CONSTRAINT "sessions_unites_compte_id_comptes_unites_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_unites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voitures" ADD CONSTRAINT "voitures_proprietaire_id_proprietaires_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."proprietaires"("id") ON DELETE no action ON UPDATE no action;