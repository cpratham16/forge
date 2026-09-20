// AdapterConformance test — verifies each adapter returns valid conformance metadata.
import { describe, it, expect } from 'vitest';
import { MockModelProvider } from '../../src/model/mock.js';
import { ClaudeModelProvider } from '../../src/model/claude.js';
import type { AdapterConformance } from '@runforge/contracts';

function validateConformance(conformance: AdapterConformance): void {
  expect(conformance).toHaveProperty('adapterName');
  expect(conformance).toHaveProperty('portName');
  expect(conformance).toHaveProperty('enforcedGuarantees');
  expect(conformance).toHaveProperty('unenforcedGuarantees');
  expect(conformance).toHaveProperty('limitations');

  expect(typeof conformance.adapterName).toBe('string');
  expect(conformance.adapterName.length).toBeGreaterThan(0);

  expect(typeof conformance.portName).toBe('string');
  expect(conformance.portName.length).toBeGreaterThan(0);

  expect(Array.isArray(conformance.enforcedGuarantees)).toBe(true);
  expect(conformance.enforcedGuarantees.length).toBeGreaterThan(0);

  expect(Array.isArray(conformance.unenforcedGuarantees)).toBe(true);
  expect(Array.isArray(conformance.limitations)).toBe(true);

  // No false parity: if a guarantee is unenforced, it must NOT appear in enforced
  for (const unenforcedItem of conformance.unenforcedGuarantees) {
    expect(
      conformance.enforcedGuarantees,
      `Guarantee "${unenforcedItem}" appears in both enforced and unenforced — false parity`,
    ).not.toContain(unenforcedItem);
  }
}

describe('AdapterConformance', () => {
  it('MockModelProvider returns valid conformance', () => {
    const conformance = MockModelProvider.conformance();
    validateConformance(conformance);
    expect(conformance.adapterName).toBe('mock');
    expect(conformance.portName).toBe('ModelProvider');
  });

  it('ClaudeModelProvider returns valid conformance', () => {
    const conformance = ClaudeModelProvider.conformance();
    validateConformance(conformance);
    expect(conformance.adapterName).toBe('claude');
    expect(conformance.portName).toBe('ModelProvider');
  });

  it('Claude adapter declares real guarantees mock does not', () => {
    const mockConf = MockModelProvider.conformance();
    const claudeConf = ClaudeModelProvider.conformance();

    // Claude should enforce actual-llm-inference which mock does not
    expect(claudeConf.enforcedGuarantees).toContain('actual-llm-inference');
    expect(mockConf.unenforcedGuarantees).toContain('actual-llm-inference');
  });

  it('conformance declarations have no false parity', () => {
    // Both adapters should have distinct enforced sets
    const mockConf = MockModelProvider.conformance();
    const claudeConf = ClaudeModelProvider.conformance();

    // Verify guarantees the mock doesn't enforce are listed as unenforced
    expect(mockConf.unenforcedGuarantees.length).toBeGreaterThan(0);
    expect(mockConf.limitations.length).toBeGreaterThan(0);

    // Claude has more enforced guarantees than mock
    expect(claudeConf.enforcedGuarantees.length).toBeGreaterThan(
      mockConf.enforcedGuarantees.length,
    );
  });
});
