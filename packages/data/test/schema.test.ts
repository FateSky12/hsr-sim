import { describe, expect, it } from 'vitest';
import { DataManifestSchema, assertRevision, parseCharacterData, trainingStriker } from '../src/index.js';

describe('versioned data adapters', () => {
  it('validates fixture data at runtime and rejects missing provenance', () => {
    expect(parseCharacterData(trainingStriker).source.revision).toBe('hsr-sim-0.1');
    expect(() => parseCharacterData({ ...trainingStriker, source: undefined })).toThrow();
  });

  it('requires an explicit source revision before a bundle can be used', () => {
    const manifest = DataManifestSchema.parse({ schemaVersion: 1, sourceKind: 'StarRailRes', revision: 'abc123', clientVersion: 'fixture' });
    expect(() => assertRevision(manifest, 'different')).toThrow(/revision mismatch/);
  });

  it('accepts an upstream manifest whose Git revision is known but client label is absent', () => {
    const manifest = DataManifestSchema.parse({ schemaVersion: 1, sourceKind: 'StarRailRes', revision: 'abc123' });
    expect(manifest.clientVersion).toBeUndefined();
  });
});
