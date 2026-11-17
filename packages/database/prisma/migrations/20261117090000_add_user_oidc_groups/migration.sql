-- AlterTable
ALTER TABLE "users" ADD COLUMN "oidc_groups" TEXT[] DEFAULT ARRAY[]::TEXT[];
