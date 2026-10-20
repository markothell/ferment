-- Communities become gatherings (docs/plan/ferment/STARTERS.md §1). Renames only:
-- every row, key and link stays. Constraint and index names follow, so this
-- database matches one built fresh from the schema. A harvest that is still
-- taking yeses is now "collecting", leaving "gathering" one meaning.
ALTER TABLE "communities" RENAME TO "gatherings";--> statement-breakpoint
ALTER TABLE "gatherings" RENAME CONSTRAINT "communities_pkey" TO "gatherings_pkey";--> statement-breakpoint
ALTER TABLE "gatherings" RENAME CONSTRAINT "communities_slug_unique" TO "gatherings_slug_unique";--> statement-breakpoint
ALTER TABLE "gatherings" RENAME CONSTRAINT "communities_created_by_user_id_fk" TO "gatherings_created_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "community_members" RENAME TO "gathering_members";--> statement-breakpoint
ALTER TABLE "gathering_members" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "gathering_members" RENAME CONSTRAINT "community_members_community_id_user_id_pk" TO "gathering_members_gathering_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "gathering_members" RENAME CONSTRAINT "community_members_community_id_communities_id_fk" TO "gathering_members_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "gathering_members" RENAME CONSTRAINT "community_members_user_id_user_id_fk" TO "gathering_members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "gathering_members" RENAME CONSTRAINT "community_members_invited_by_user_id_fk" TO "gathering_members_invited_by_user_id_fk";--> statement-breakpoint
ALTER TABLE "circles" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "circles" RENAME CONSTRAINT "circles_community_id_communities_id_fk" TO "circles_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER INDEX "circles_community_id_slug_index" RENAME TO "circles_gathering_id_slug_index";--> statement-breakpoint
ALTER INDEX "circles_community_id_status_index" RENAME TO "circles_gathering_id_status_index";--> statement-breakpoint
ALTER TABLE "harvests" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "harvests" RENAME CONSTRAINT "harvests_community_id_communities_id_fk" TO "harvests_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER INDEX "harvests_community_id_status_index" RENAME TO "harvests_gathering_id_status_index";--> statement-breakpoint
ALTER TABLE "invites" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "invites" RENAME CONSTRAINT "invites_community_id_communities_id_fk" TO "invites_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER INDEX "invites_community_id_email_index" RENAME TO "invites_gathering_id_email_index";--> statement-breakpoint
ALTER INDEX "invites_community_id_status_index" RENAME TO "invites_gathering_id_status_index";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "notifications" RENAME CONSTRAINT "notifications_community_id_communities_id_fk" TO "notifications_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER TABLE "prompts" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "prompts" RENAME CONSTRAINT "prompts_community_id_communities_id_fk" TO "prompts_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER INDEX "prompts_community_id_index" RENAME TO "prompts_gathering_id_index";--> statement-breakpoint
ALTER TABLE "rounds" RENAME COLUMN "community_id" TO "gathering_id";--> statement-breakpoint
ALTER TABLE "rounds" RENAME CONSTRAINT "rounds_community_id_communities_id_fk" TO "rounds_gathering_id_gatherings_id_fk";--> statement-breakpoint
ALTER INDEX "rounds_community_id_phase_index" RENAME TO "rounds_gathering_id_phase_index";--> statement-breakpoint
ALTER TYPE "harvest_status" RENAME VALUE 'gathering' TO 'collecting';
--> statement-breakpoint
-- Postgres 18 names NOT NULL constraints too; older versions have none to rename.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
           WHERE connamespace = 'public'::regnamespace AND contype = 'n' AND conname LIKE '%communit%'
  LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', c.tbl, c.conname,
      replace(replace(c.conname, 'communities', 'gatherings'), 'community', 'gathering'));
  END LOOP;
END $$;
