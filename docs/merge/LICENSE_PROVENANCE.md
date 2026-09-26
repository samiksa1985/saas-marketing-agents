# License / Provenance Gate

## Project 1

The upstream `saas-marketing-agents` repository identifies itself as MIT-licensed. The current fork retains the upstream LICENSE and is used as the platform foundation.

## Project 2

The supplied backup does not include a root LICENSE file in the archive inventory. Treat provenance as **unresolved until ownership/source is confirmed**. Do not claim project-2 code is open source.

## Required before commercial release

- preserve the upstream MIT LICENSE where its code remains in the product
- create `THIRD_PARTY_LICENSES/`
- record source repository/commit for every reused OSS component
- record which files are modified upstream code vs new proprietary code
- scan direct and transitive dependencies
- flag GPL/AGPL/SSPL or commercial-use restrictions for legal review
- add CI license/provenance checks

## Canonical ownership split

1. Upstream OSS: retained under its original license.
2. User-owned/new code: proprietary project IP subject to counsel/terms.
3. Third-party components: governed by their individual licenses.

No commercial launch should rely on an assumption about provenance.
