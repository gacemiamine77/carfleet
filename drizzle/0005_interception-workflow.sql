ALTER TYPE "public"."statut_alerte" ADD VALUE 'en_cours' BEFORE 'traite';--> statement-breakpoint
ALTER TYPE "public"."statut_alerte" ADD VALUE 'terminee' BEFORE 'traite';--> statement-breakpoint
ALTER TYPE "public"."statut_alerte" ADD VALUE 'abandonnee' BEFORE 'traite';--> statement-breakpoint
CREATE TABLE "notifications_unites" (
	"id" serial PRIMARY KEY NOT NULL,
	"unite_id" integer NOT NULL,
	"type" varchar(30) DEFAULT 'info' NOT NULL,
	"titre" varchar(200) NOT NULL,
	"corps" text,
	"infraction_id" integer,
	"unite_source_id" integer,
	"lu" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD COLUMN "notifie_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD COLUMN "accepte_unite_id" integer;--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD COLUMN "accepte_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD COLUMN "cloture_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD COLUMN "resultat" varchar(40);--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD COLUMN "compte_rendu" text;--> statement-breakpoint
ALTER TABLE "notifications_unites" ADD CONSTRAINT "notifications_unites_unite_id_unites_securite_id_fk" FOREIGN KEY ("unite_id") REFERENCES "public"."unites_securite"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infractions_constatees" ADD CONSTRAINT "infractions_constatees_accepte_unite_id_unites_securite_id_fk" FOREIGN KEY ("accepte_unite_id") REFERENCES "public"."unites_securite"("id") ON DELETE no action ON UPDATE no action;