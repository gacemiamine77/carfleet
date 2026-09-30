CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TABLE "vehicle_current_position" (
	"voiture_id" integer PRIMARY KEY NOT NULL,
	"car_id" varchar(64) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"vitesse" double precision,
	"cap" double precision,
	"carburant" double precision,
	"itineraire_id" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "footprints" ADD COLUMN "geog" geography(Point,4326);--> statement-breakpoint
ALTER TABLE "footprints" ADD COLUMN "carburant" double precision;--> statement-breakpoint
ALTER TABLE "vehicle_current_position" ADD CONSTRAINT "vehicle_current_position_voiture_id_voitures_id_fk" FOREIGN KEY ("voiture_id") REFERENCES "public"."voitures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_current_position" ADD CONSTRAINT "vehicle_current_position_itineraire_id_itineraires_id_fk" FOREIGN KEY ("itineraire_id") REFERENCES "public"."itineraires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "footprints_recorded_brin" ON "footprints" USING brin ("recorded_at");--> statement-breakpoint
CREATE INDEX "footprints_geog_gist" ON "footprints" USING gist ("geog");--> statement-breakpoint
CREATE INDEX "footprints_voiture_time" ON "footprints" USING btree ("voiture_id","recorded_at");