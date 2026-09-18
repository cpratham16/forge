// `forge mine` — analyze failure traces to identify reusable weakness patterns.
import { mineWeaknesses, formatWeaknessReport } from '@forge/adapters';

export async function mineCommand(args: string[]): Promise<string> {
  const traceDirIdx = args.indexOf('--dir');
  const traceDir = traceDirIdx !== -1 ? args[traceDirIdx + 1] : '.forge/traces';

  const asJson = args.includes('--json');

  const report = await mineWeaknesses(traceDir);

  if (asJson) {
    return JSON.stringify(report, null, 2);
  }

  return formatWeaknessReport(report);
}