// `forge propose` — generate bounded harness edit proposals from weakness analysis.
import { generateProposals, formatProposal, saveProposals } from '@runforge/adapters';

export async function proposeCommand(args: string[]): Promise<string> {
  const traceDirIdx = args.indexOf('--dir');
  const traceDir = traceDirIdx !== -1 ? args[traceDirIdx + 1] : '.forge/traces';

  const saveIdx = args.indexOf('--save');
  const saveDir = saveIdx !== -1 ? args[saveIdx + 1] : '.forge/proposals';

  const asJson = args.includes('--json');

  const proposals = await generateProposals(traceDir);

  if (proposals.length === 0) {
    return 'No proposals generated (no weakness patterns found).';
  }

  if (saveIdx !== -1) {
    await saveProposals(proposals, saveDir);
  }

  if (asJson) {
    return JSON.stringify(proposals, null, 2);
  }

  const lines = [
    `Generated ${proposals.length} proposal(s):`,
    '',
  ];

  for (const proposal of proposals) {
    lines.push(formatProposal(proposal));
    lines.push('');
  }

  if (saveIdx !== -1) {
    lines.push(`Saved to ${saveDir}/`);
  }

  return lines.join('\n');
}