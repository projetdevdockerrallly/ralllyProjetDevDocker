# Échéance des sondages

Cette note résume les changements de la branche `feat/poll-voting-deadline`.

## Comportement ajouté

- À la création ou à la modification d’un sondage, l’organisateur peut définir une date et une heure limites. La saisie est interprétée dans son fuseau local.
- À partir de l’échéance, les participants ne peuvent plus créer, modifier, renommer ni supprimer leurs réponses. Cette règle est appliquée côté serveur dans la transaction qui écrit les réponses : elle ne dépend donc pas du cron.
- Une tâche planifiée ferme ensuite le sondage, enregistre sa fermeture et déclenche les webhooks. L’interface indique que l’échéance est passée et affiche la date de clôture.
- L’organisateur peut rouvrir un sondage fermé pour échéance en supprimant celle-ci ou en la repoussant dans le futur.

## Modifications techniques

- **Formulaires et affichage** — ajout du champ dans [`poll-settings.tsx`](apps/web/src/features/poll/components/forms/poll-settings.tsx), utilisé à la création et à la modification; conversion entre heure locale et instant UTC; affichage de l’échéance sur les pages du sondage.
- **Écriture des réponses** — vérification de l’échéance sous verrou de la ligne du sondage dans [`participant/mutations.ts`](apps/web/src/features/poll/participant/mutations.ts).
- **Clôture automatique** — ajout de la tâche `/api/house-keeping/auto-close-deadline-polls` dans [`route.ts`](apps/web/src/app/api/house-keeping/[...method]/route.ts), planifiée chaque minute dans [`vercel.json`](apps/web/vercel.json). Elle enregistre la fermeture et programme les webhooks après la transaction.
- **API** — les API privée et v1 acceptent une échéance ISO 8601 facultative et la renvoient dans leurs réponses. La référence [`openapi.json`](apps/docs/api-reference/openapi.json) a été régénérée.
- **Base de données** — le champ `deadline` existait déjà dans [`poll.prisma`](packages/database/prisma/models/poll.prisma). La [`migration`](packages/database/prisma/migrations/20261118092500_add_poll_deadline_closure/migration.sql) ajoute la raison de fermeture `deadline` et un index pour trouver les sondages échus.
- **Historique et documentation** — les modifications d’échéance et les fermetures correspondantes apparaissent dans l’activité du sondage. La [`FAQ`](apps/docs/faq.mdx) a été mise à jour.

## Vérifications

Les tests ciblés (49 tests), le type-check web, la validation et la génération Prisma, les contrôles de structure et de locales ainsi que Biome ont réussi. La migration n’a pas été appliquée à une base de données.
