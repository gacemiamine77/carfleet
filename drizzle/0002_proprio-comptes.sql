CREATE TABLE "affectations" (
	"id" serial PRIMARY KEY NOT NULL,
	"voiture_id" integer NOT NULL,
	"conducteur_id" integer NOT NULL,
	"debut_at" timestamp with time zone DEFAULT now(),
	"fin_at" timestamp with time zone,
	"actif" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comptes_proprietaires" (
	"id" serial PRIMARY KEY NOT NULL,
	"proprietaire_id" integer NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"actif" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "comptes_proprietaires_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "sessions_proprietaires" (
	"token" varchar(96) PRIMARY KEY NOT NULL,
	"compte_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "affectations" ADD CONSTRAINT "affectations_voiture_id_voitures_id_fk" FOREIGN KEY ("voiture_id") REFERENCES "public"."voitures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectations" ADD CONSTRAINT "affectations_conducteur_id_conducteurs_id_fk" FOREIGN KEY ("conducteur_id") REFERENCES "public"."conducteurs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comptes_proprietaires" ADD CONSTRAINT "comptes_proprietaires_proprietaire_id_proprietaires_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."proprietaires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_proprietaires" ADD CONSTRAINT "sessions_proprietaires_compte_id_comptes_proprietaires_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."comptes_proprietaires"("id") ON DELETE no action ON UPDATE no action;