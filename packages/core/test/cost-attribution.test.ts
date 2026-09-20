// Cost attribution tests (PHASED_PLAN Phase 7): per-agent token/cost
// attribution and USD-per-verified-task from trace model.response events.
// USD is only ever computed from explicitly supplied rates — Forge does not
// embed a price table.
import { describe, it, expect } from 'vitest';
import { attributeModelCost } from '../src/quality/cost-attribution.js';
import type { TraceEvent } from '@runforge/contracts';

function response(agent: string, usage: { inputTokens: number; outputTokens: number }, model?: string): TraceEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    timestamp: 1,
    type: 'model.response',
    agent,
    payload: { usage, ...(model !== undefined ? { model } : {}) },
  };
}

describe('attributeModelCost', () => {
  it('attributes tokens and USD per agent from supplied rates', () => {
    const traceEvents: TraceEvent[] = [
      response('developer', { inputTokens: 1000, outputTokens: 500 }, 'claude-x'),
      response('developer', { inputTokens: 2000, outputTokens: 1000 }, 'claude-x'),
      response('reviewer', { inputTokens: 500, outputTokens: 300 }, 'claude-x'),
      response('reviewer', { inputTokens: 300, outputTokens: 100 }, 'claude-x'),
      response('developer', { inputTokens: 100, outputTokens: 50 }),
      response('developer', { inputTokens: 50, outputTokens: 25 }),
    ];
    // A failed/errored response records no usage and contributes nothing.
    traceEvents.push({ id: 'evt-err', timestamp: 1, type: 'model.response', agent: 'developer', payload: { error: 'boom' } });
    // Two verified tasks for the per-task figure.
    traceEvents.push({ id: 'evt-v1', timestamp: 1, type: 'verification.result', agent: 'developer', payload: { status: 'verified' } });
    traceEvents.push({ id: 'evt-v2', timestamp: 1, type: 'verification.result', agent: 'developer', payload: { status: 'verified' } });

    const rates = {
      'claude-x': { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
      developer: { inputPerMTokUsd: 1, outputPerMTokUsd: 2 },
    };

    const result = attributeModelCost(traceEvents, { rates });

    expect(result.agents).toHaveLength(2);

    const developer = result.agents.find((a) => a.agent === 'developer');
    const reviewer = result.agents.find((a) => a.agent === 'reviewer');

    expect(developer?.inputTokens).toBe(1000 + 2000 + 100 + 50);
    expect(developer?.outputTokens).toBe(500 + 1000 + 50 + 25);
    expect(developer?.costUsd).toBeCloseTo((3000 * 3 + 1500 * 15) / 1e6 + (150 * 1 + 75 * 2) / 1e6, 6);

    expect(reviewer?.inputTokens).toBe(800);
    expect(reviewer?.outputTokens).toBe(400);
    expect(reviewer?.costUsd).toBeCloseTo((800 * 3 + 400 * 15) / 1e6, 6);

    expect(result.totalInputTokens).toBe(1000 + 2000 + 500 + 300 + 100 + 50);
    expect(result.totalOutputTokens).toBe(500 + 1000 + 300 + 100 + 50 + 25);
    expect(result.totalCostUsd).toBeCloseTo(developer!.costUsd + reviewer!.costUsd, 6);
    expect(result.costPerVerifiedTaskUsd).toBeCloseTo(result.totalCostUsd / 2, 6);
    expect(result.rateSource).toBe('explicit-rates');
  });

  it('attributes tokens even without rates and reports rateSource none', () => {
    const traceEvents: TraceEvent[] = [response('developer', { inputTokens: 100, outputTokens: 40 })];
    const result = attributeModelCost(traceEvents);

    expect(result.agents[0]?.inputTokens).toBe(100);
    expect(result.totalCostUsd).toBe(0);
    expect(result.rateSource).toBe('none');
    expect(result.costPerVerifiedTaskUsd).toBeNull();
  });

  it('applies a fallback rate when the keyed rate is missing', () => {
    const traceEvents: TraceEvent[] = [
      response('developer', { inputTokens: 1000, outputTokens: 500 }, 'unknown-model'),
    ];
    const result = attributeModelCost(traceEvents, {
      rates: { other: { inputPerMTokUsd: 1, outputPerMTokUsd: 1 } },
      fallbackRate: { inputPerMTokUsd: 2, outputPerMTokUsd: 4 },
    });

    expect(result.totalCostUsd).toBeCloseTo((1000 * 2 + 500 * 4) / 1e6, 6);
    expect(result.rateSource).toBe('fallback-only');
  });
});