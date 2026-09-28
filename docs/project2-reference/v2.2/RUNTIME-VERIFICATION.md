# V2.2 — Runtime Verification

The repository was inspected in the available runtime.

The structural validator passes. Dependency installation could not be completed in the
sandbox, so Prisma generation, typecheck, automated tests and production build are NOT
certified. These are intentionally marked as not passed rather than assumed.

## GitHub gate
Do not treat this release as production-certified until the runtime gates pass:
npm ci → prisma generate → typecheck → tests → build.
