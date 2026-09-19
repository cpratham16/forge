// Model cost attribution — pure projection from trace model.response events
// (PHASED_PLAN Phase 7, PRD §10 "cost per verified task").
//
// Tokens are attributed per agent directly from the trace. USD conversion is
// performed ONLY from explicitly supplied token rates — Forge does not embed
// a model price table (that would be an external claim maintained from
// memory, the exact thing docs/ disallows). Without rates, costUsd stays 0
// and the `rateSource` field says so honestly.
import type { TraceEvent } from '@forge/contracts';

export interface ModelCostRate {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
}

export interface AgentCostLine {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CostAttributionResult {
  agents: AgentCostLine[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  /** USD per task that produced a verified verification.result. Null when no
   * task was verified. */
  costPerVerifiedTaskUsd: number | null;
  costPerVerifiedTaskUsdUnits: 'usd-per-verified-task';
  rateSource: 'explicit-rates' | 'fallback-only' | 'none';
}

export interface CostAttributionOptions {
  /** Keyed by model name; a response without a model name falls back to its
   * agent name. */
  rates?: Record<string, ModelCostRate>;
  /** Applied when a response's model/agent key is not in `rates`. */
  fallbackRate?: ModelCostRate;
}

interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
}

function normalizeUsage(payload: Record<string, unknown>): NormalizedUsage | undefined {
  if (payload.error !== undefined) return undefined;
  const usage = payload.usage as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  if (usage === undefined || typeof usage !== 'object' || usage === null) return undefined;
  const input = Number(usage.inputTokens ?? 0);
  const output = Number(usage.outputTokens ?? 0);
  if (!Number.isFinite(input) || !Number.isFinite(output) || (input === 0 && output === 0)) return undefined;
  return { inputTokens: input, outputTokens: output };
}

export function attributeModelCost(traceEvents: TraceEvent[], options: CostAttributionOptions = {}): CostAttributionResult {
  const byAgent = new Map<string, AgentCostLine>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let usedExplicit = false;
  let usedFallback = false;

  const verifiedResults = traceEvents.filter(
    (e) => e.type === 'verification.result' && (e.payload as { status?: unknown }).status === 'verified',
  ).length;

  for (const event of traceEvents) {
    if (event.type !== 'model.response') continue;
    const usage = normalizeUsage(event.payload);
    if (usage === undefined) continue;

    const rawModel = (event.payload as { model?: unknown }).model;
    const model = typeof rawModel === 'string' && rawModel.length > 0 ? rawModel : event.agent;
    const rate = options.rates?.[model] ?? options.fallbackRate;

    let cost = 0;
    if (rate !== undefined) {
      const keyed = options.rates?.[model] !== undefined;
      if (keyed) usedExplicit = true;
      else if (options.rates !== undefined) usedFallback = true;
      cost =
        (usage.inputTokens * rate.inputPerMTokUsd + usage.outputTokens * rate.outputPerMTokUsd) / 1_000_000;
    }

    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;
    totalCostUsd += cost;

    const existing = byAgent.get(event.agent);
    if (existing !== undefined) {
      existing.inputTokens += usage.inputTokens;
      existing.outputTokens += usage.outputTokens;
      existing.costUsd += cost;
    } else {
      byAgent.set(event.agent, {
        agent: event.agent,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost,
      });
    }
  }

  const agents = Array.from(byAgent.values());
  let rateSource: CostAttributionResult['rateSource'] = 'none';
  if (options.rates !== undefined && usedExplicit) rateSource = 'explicit-rates';
  else if (options.rates !== undefined && !usedExplicit && usedFallback) rateSource = 'fallback-only';

  return {
    agents,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    costPerVerifiedTaskUsd: verifiedResults > 0 ? totalCostUsd / verifiedResults : null,
    costPerVerifiedTaskUsdUnits: 'usd-per-verified-task',
    rateSource,
  };
}