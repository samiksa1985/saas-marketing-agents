CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TYPE "document_source_type" AS ENUM ('file', 'url', 'inline');
--> statement-breakpoint

CREATE TYPE "document_status" AS ENUM ('uploaded', 'processing', 'ready', 'failed', 'archived');
--> statement-breakpoint

CREATE TABLE "knowledge_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "mime_type" text NOT NULL,
  "storage_path" text NOT NULL,
  "source_type" "document_source_type" DEFAULT 'file' NOT NULL,
  "status" "document_status" DEFAULT 'uploaded' NOT NULL,
  "size_bytes" integer,
  "checksum" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_url" text,
  "page_count" integer,
  "word_count" integer,
  "error_message" text,
  "processed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "knowledge_documents_tenant_status_idx"
ON "knowledge_documents" ("tenant_id","status");
--> statement-breakpoint

CREATE INDEX "knowledge_documents_tenant_source_idx"
ON "knowledge_documents" ("tenant_id","source_type");
--> statement-breakpoint

CREATE INDEX "knowledge_documents_tenant_checksum_idx"
ON "knowledge_documents" ("tenant_id","checksum");
--> statement-breakpoint

CREATE TABLE "knowledge_document_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "text" text NOT NULL,
  "embedding" jsonb,
  "embedding_vector" vector(1536),
  "page_number" integer,
  "slide_number" integer,
  "sheet_name" text,
  "source_ref" text,
  "token_count" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "knowledge_chunks_tenant_idx"
ON "knowledge_document_chunks" ("tenant_id");
--> statement-breakpoint

CREATE INDEX "knowledge_chunks_document_idx"
ON "knowledge_document_chunks" ("document_id","chunk_index");
--> statement-breakpoint

CREATE INDEX "knowledge_chunks_document_page_idx"
ON "knowledge_document_chunks" ("document_id","page_number");
--> statement-breakpoint

CREATE INDEX "knowledge_chunks_embedding_vector_hnsw_idx"
ON "knowledge_document_chunks"
USING hnsw ("embedding_vector" vector_cosine_ops);
--> statement-breakpoint

CREATE TABLE "knowledge_document_citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "knowledge_documents"("id") ON DELETE CASCADE,
  "chunk_id" uuid REFERENCES "knowledge_document_chunks"("id") ON DELETE SET NULL,
  "agent_run_id" uuid,
  "workflow_run_id" uuid,
  "query" text NOT NULL,
  "excerpt" text NOT NULL,
  "relevance_score" real NOT NULL,
  "source_ref" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "knowledge_citations_tenant_created_idx"
ON "knowledge_document_citations" ("tenant_id","created_at");
--> statement-breakpoint

CREATE INDEX "knowledge_citations_agent_run_idx"
ON "knowledge_document_citations" ("agent_run_id");
--> statement-breakpoint

CREATE INDEX "knowledge_citations_workflow_run_idx"
ON "knowledge_document_citations" ("workflow_run_id");
--> statement-breakpoint

ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_document_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_document_citations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'knowledge_documents',
    'knowledge_document_chunks',
    'knowledge_document_citations'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
