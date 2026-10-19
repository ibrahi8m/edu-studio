import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { findExternalUrls } from '../../scripts/check-offline.mjs';

describe('build offline scanner', () => {
  it('flags hosted fonts, CDNs and APIs', () => {
    const src = `@import url("https://fonts.googleapis.com/css2?family=Cairo"); fetch("https://api.example.com/x"); <script src="https://cdn.jsdelivr.net/npm/a">`;
    expect(findExternalUrls(src)).toHaveLength(3);
  });
  it('ignores SVG namespaces, localhost and known error-message links', () => {
    const src = `xmlns="http://www.w3.org/2000/svg" "http://localhost:4173/" "https://react.dev/errors/418"`;
    expect(findExternalUrls(src)).toEqual([]);
  });
});
