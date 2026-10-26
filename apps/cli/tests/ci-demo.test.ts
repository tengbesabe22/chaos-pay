import { expect, it } from 'vitest';

// Temporary learning exercise: removed after inspecting the failed CI run.
it('demonstrates how a failing test appears in GitHub Actions', () => {
  expect('temporary failure').toBe('passing test');
});
