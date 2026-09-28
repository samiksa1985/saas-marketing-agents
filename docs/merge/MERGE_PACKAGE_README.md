# Merge script status

No blind source copy script is included yet.

Reason: Project 1 and Project 2 have different application/runtime architectures (NestJS monorepo vs Next.js/Prisma monolith). A blind copy would create two backends/control planes and cause the exact technical fragmentation the merge is meant to remove.

The next code batch should be implemented against the canonical Project 1 repository after the domain contract map is reviewed.
