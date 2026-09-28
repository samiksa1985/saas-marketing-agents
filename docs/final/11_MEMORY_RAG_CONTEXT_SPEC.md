# Memory, RAG, and context specification

`MarketingContextBuilder` combines tenant-scoped memory and knowledge retrieval before planning. In-memory repositories support dev/test; persistence provides tenant guards and hybrid ranking. The knowledge model has documents, chunks, citations, evidence identifiers, and PostgreSQL vector-oriented schema/migration source. Results retain citation/evidence provenance instead of inventing source claims.

The code boundary is complete enough for repository tests, but production retrieval requires PostgreSQL/vector extensions, embeddings, object storage, ingestion, indexing, credentials, and RLS verification. Those dependencies are not deployed or verified by this freeze.
