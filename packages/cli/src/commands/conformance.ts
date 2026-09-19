// `forge conformance` — surface AdapterConformance metadata for all registered adapters
import { MockModelProvider } from '@runforge/adapters';
import { ClaudeModelProvider } from '@runforge/adapters';
import { OpenAICompatibleModelProvider } from '@runforge/adapters';
import { FilesystemTool } from '@runforge/adapters';
import { ShellTool } from '@runforge/adapters';
import { GitTool } from '@runforge/adapters';
import { SearchTool } from '@runforge/adapters';
import { ShellCommandVerifier } from '@runforge/adapters';
import { FilesystemContextAdapter } from '@runforge/adapters';
import { JsonlTraceSink } from '@runforge/adapters';
import type { AdapterConformance } from '@runforge/contracts';

interface ConformanceTableRow {
  adapter: string;
  port: string;
  enforced: string;
  unenforced: string;
  limitations: string;
}

function getAllAdapters(): Array<{ name: string; conformance: () => AdapterConformance }> {
  return [
    { name: 'mock', conformance: () => MockModelProvider.conformance() },
    { name: 'claude', conformance: () => ClaudeModelProvider.conformance() },
    { name: 'openai-compatible', conformance: () => OpenAICompatibleModelProvider.conformance() },
    { name: 'filesystem', conformance: () => FilesystemTool.conformance() },
    { name: 'shell', conformance: () => ShellTool.conformance() },
    { name: 'git', conformance: () => GitTool.conformance() },
    { name: 'search', conformance: () => SearchTool.conformance() },
    { name: 'shell-command-verifier', conformance: () => ShellCommandVerifier.conformance() },
    { name: 'filesystem-context', conformance: () => FilesystemContextAdapter.conformance() },
    { name: 'jsonl-trace-sink', conformance: () => JsonlTraceSink.conformance() },
  ];
}

function formatArray(arr: string[], maxItems = 3): string {
  if (arr.length === 0) return '—';
  if (arr.length <= maxItems) return arr.join(', ');
  return `${arr.slice(0, maxItems).join(', ')} … (+${arr.length - maxItems} more)`;
}

function collectConformanceData(): ConformanceTableRow[] {
  const adapters = getAllAdapters();
  const rows: ConformanceTableRow[] = [];

  for (const { name, conformance } of adapters) {
    try {
      const conf = conformance();
      rows.push({
        adapter: name,
        port: conf.portName,
        enforced: formatArray(conf.enforcedGuarantees),
        unenforced: formatArray(conf.unenforcedGuarantees),
        limitations: formatArray(conf.limitations),
      });
    } catch (err) {
      rows.push({
        adapter: name,
        port: 'ERROR',
        enforced: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
        unenforced: '',
        limitations: '',
      });
    }
  }

  return rows;
}

function renderTable(rows: ConformanceTableRow[]): string {
  if (rows.length === 0) return 'No data to display.';

  const h0 = 'Adapter';
  const h1 = 'Port';
  const h2 = 'Enforced Guarantees';
  const h3 = 'Unenforced Guarantees';
  const h4 = 'Limitations';

  let w0 = h0.length;
  let w1 = h1.length;
  let w2 = h2.length;
  let w3 = h3.length;
  let w4 = h4.length;

  for (const row of rows) {
    if (row.adapter.length > w0) w0 = row.adapter.length;
    if (row.port.length > w1) w1 = row.port.length;
    if (row.enforced.length > w2) w2 = row.enforced.length;
    if (row.unenforced.length > w3) w3 = row.unenforced.length;
    if (row.limitations.length > w4) w4 = row.limitations.length;
  }

  const pad = (str: string, width: number) => str.padEnd(width);
  const sep = ' | ';

  let headerLine = '';
  headerLine += pad(h0, w0) + sep;
  headerLine += pad(h1, w1) + sep;
  headerLine += pad(h2, w2) + sep;
  headerLine += pad(h3, w3) + sep;
  headerLine += pad(h4, w4);

  const divider = `${'─'.repeat(w0)}-+- ${'─'.repeat(w1)}-+- ${'─'.repeat(w2)}-+- ${'─'.repeat(w3)}-+- ${'─'.repeat(w4)}`;

  const lines = [headerLine, divider];
  for (const row of rows) {
    let line = '';
    line += pad(row.adapter, w0) + sep;
    line += pad(row.port, w1) + sep;
    line += pad(row.enforced, w2) + sep;
    line += pad(row.unenforced, w3) + sep;
    line += pad(row.limitations, w4);
    lines.push(line);
  }
  return lines.join('\n');
}

export async function conformanceCommand(args: string[]): Promise<string> {
  const asJson = args.includes('--json');
  const portFilter = args.find((a) => a.startsWith('--port='))?.split('=')[1];

  const rows = collectConformanceData();
  const filtered = portFilter ? rows.filter((r) => r.port === portFilter) : rows;

  if (asJson) {
    return JSON.stringify(filtered, null, 2);
  }

  if (filtered.length === 0) {
    return portFilter ? `No adapters found for port: ${portFilter}` : 'No adapters registered.';
  }

  return renderTable(filtered);
}