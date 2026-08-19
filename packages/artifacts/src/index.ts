import type { Artifact, Id, Locale, TranslationGroup } from '@platform/contracts';

export interface ArtifactStore {
  put(tenantId: Id, key: string, content: string): Promise<string>;
  get(tenantId: Id, key: string): Promise<string>;
}

export function createArtifact(
  input: Omit<Artifact, 'id' | 'version'> & { version?: number },
): Artifact {
  return { ...input, id: crypto.randomUUID(), version: input.version ?? 1 };
}

export function linkTranslation(tenantId: Id, locales: Locale[]): TranslationGroup {
  if (locales.length < 2) throw new Error('Bilingual artifacts require at least two locales');
  return { id: crypto.randomUUID(), tenantId };
}
