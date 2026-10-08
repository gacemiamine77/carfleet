ALTER TABLE "voitures" ADD COLUMN "numero_serie" varchar(40);--> statement-breakpoint
ALTER TABLE "voitures" ADD CONSTRAINT "voitures_numero_serie_unique" UNIQUE("numero_serie");