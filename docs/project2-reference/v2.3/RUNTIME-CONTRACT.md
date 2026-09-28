# Runtime Contract

The application expects:

1. PostgreSQL reachable through `DATABASE_URL`.
2. pgvector extension available for RAG.
3. Server-side authentication secret.
4. OpenAI API key only on the server for real provider mode.
5. Production secrets supplied through the deployment secret manager.

No secret should be committed to Git.
