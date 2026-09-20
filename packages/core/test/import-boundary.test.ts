// Import boundary test: the orchestrator module must NOT import @anthropic-ai/sdk
// This is a dependency rule enforcement test (Phase 2, PRD §5).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('import boundary', () => {
  it('orchestrator module does not import @anthropic-ai/sdk', () => {
    const coreDir = join(__dirname, '..', 'src');
    const tsFiles = collectTsFiles(coreDir);

    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('@anthropic-ai/sdk');
      expect(content).not.toContain('anthropic');
    }
  });

  it('core package only imports from @runforge/contracts', () => {
    const coreDir = join(__dirname, '..', 'src');
    const tsFiles = collectTsFiles(coreDir);

    const forbiddenImports = [
      '@runforge/adapters',
      '@anthropic-ai/sdk',
      'node:fs',
      'node:http',
      'node:child_process',
      'openai',
    ];

    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const forbidden of forbiddenImports) {
        expect(content, `File ${file} imports forbidden module: ${forbidden}`).not.toContain(
          `from '${forbidden}'`,
        );
        expect(content, `File ${file} imports forbidden module: ${forbidden}`).not.toContain(
          `from "${forbidden}"`,
        );
      }
    }
  });
});
