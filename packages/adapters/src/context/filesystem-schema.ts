// ContextPort adapter (M7) — assembles a task-specific ContextPack from repo
// state: relevant files (declared inputs first, then relevance-scored walk of
// the workspace), a token budget enforced by selection + truncation, symbols,
// git history, and AGENTS.md rules.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
  ContextPack,
  ContextPort,
  FileContext,
  GitContext,
  RuleContext,
  SymbolContext,
  AdapterConformance,
} from '@forge/contracts';

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.forge', '.next', 'out']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx', '.yaml', '.yml',
  '.css', '.html', '.sh', '.py', '.go', '.rs', '.java', '.vue', '.toml', '.cfg', '.ini', '.txt',
]);
const MAX_FILE_CHARS = 100_000;
const MAX_HISTORY_COMMITS = 10;

export interface FilesystemContextOptions {
  tokenBudget?: number;
  maxFiles?: number;
  /** Override the repo root (defaults to repo.root from RepoState). */
  cwd?: string;
}

function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

function isTextFile(name: string): boolean {
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  return TEXT_EXTENSIONS.has(ext) || name === 'AGENTS.md';
}

function tokenizeAndStem(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w)),
  );
}

export class FilesystemContextAdapter implements ContextPort {
  private readonly tokenBudget: number;
  private readonly maxFiles: number;
  private readonly cwd: string | undefined;

  constructor(options: FilesystemContextOptions = {}) {
    this.tokenBudget = options.tokenBudget ?? 8000;
    this.maxFiles = options.maxFiles ?? 20;
    this.cwd = options.cwd;
  }

  async build(task: unknown, repo: unknown): Promise<ContextPack> {
    const repoRoot = this.resolveRoot(repo);
    const taskId = this.resolveTaskId(task);
    const objective = this.resolveObjective(task);
    const declaredFiles = this.resolveDeclaredFiles(task, repoRoot);

    let candidates = declaredFiles;
    if (candidates.length === 0) {
      candidates = await this.walk(repoRoot, this.maxFiles * 4);
    }

    const scored = await this.readAndScore(candidates, repoRoot, objective, declaredFiles);

    const files: FileContext[] = [];
    let tokensUsed = 0;
    for (const file of scored) {
      if (files.length >= this.maxFiles) break;
      if (tokensUsed >= this.tokenBudget) break;
      const remaining = this.tokenBudget - tokensUsed;
      let content = file.content;
      if (estimateTokens(content.length) > remaining) {
        content = truncateToTokens(content, remaining);
      }
      files.push({ path: file.path, content, relevanceScore: file.relevanceScore });
      tokensUsed += estimateTokens(content.length);
    }

    const symbols = this.extractSymbols(files);
    const history = await this.loadHistory(repoRoot);
    const rules = await this.loadRules(repoRoot);

    tokensUsed += estimateTokens(JSON.stringify(symbols).length) + estimateTokens(JSON.stringify(history).length);

    return {
      taskId,
      files,
      symbols,
      history,
      rules,
      previousFindings: [],
      tokenBudget: this.tokenBudget,
      tokensUsed,
    };
  }

  private resolveRoot(repo: unknown): string {
    if (this.cwd !== undefined) return this.cwd;
    const candidate = repo as { root?: unknown } | null;
    if (typeof candidate?.root === 'string' && candidate.root !== '') return candidate.root;
    return '.';
  }

  private resolveTaskId(task: unknown): string {
    const candidate = task as { id?: unknown } | null;
    return typeof candidate?.id === 'string' ? candidate.id : 'task';
  }

  private resolveObjective(task: unknown): string {
    const candidate = task as { objective?: unknown } | null;
    return typeof candidate?.objective === 'string' ? candidate.objective : '';
  }

  private resolveDeclaredFiles(task: unknown, repoRoot: string): string[] {
    const candidate = task as { inputs?: { files?: unknown } } | null;
    const raw = candidate?.inputs?.files;
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const abs = resolve(repoRoot, entry);
      const rel = relative(repoRoot, abs);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
        continue; // only files inside the repo
      }
      out.push(abs);
    }
    return out;
  }

  private async walk(root: string, limit: number): Promise<string[]> {
    const out: string[] = [];
    const rec = async (dir: string): Promise<void> => {
      if (out.length >= limit) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= limit) return;
        if (SKIP_DIRS.has(entry.name)) continue;
        const child = join(dir, entry.name);
        if (entry.isDirectory()) {
          await rec(child);
        } else if (entry.isFile() && isTextFile(entry.name)) {
          out.push(child);
        }
      }
    };
    await rec(root);
    return out;
  }

  private async readAndScore(
    paths: string[],
    repoRoot: string,
    objective: string,
    declared: string[],
  ): Promise<Array<{ path: string; content: string; relevanceScore: number }>> {
    const objectiveTerms = tokenizeAndStem(objective);
    const out: Array<{ path: string; content: string; relevanceScore: number }> = [];

    for (const abs of paths) {
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_CHARS) continue;
      let content: string;
      try {
        content = await fs.readFile(abs, 'utf8');
      } catch {
        continue;
      }
      if (content.length > MAX_FILE_CHARS) content = content.slice(0, MAX_FILE_CHARS);

      const rel = relative(repoRoot, abs).replace(/\\/g, '/');
      const declaredMatch = declared.some((d) => relative(repoRoot, d).replace(/\\/g, '/') === rel);

      const fileTerms = tokenizeAndStem(`${basename(abs)} ${content}`.slice(0, 8000));
      let overlap = 0;
      for (const term of objectiveTerms) {
        if (fileTerms.has(term)) overlap++;
      }
      const baseScore = objectiveTerms.size === 0 ? 0.5 : overlap / objectiveTerms.size;
      const relevanceScore = declaredMatch ? 1 : Math.min(1, baseScore + (rel.length > 0 ? 0.1 : 0));

      out.push({
        path: rel,
        content,
        relevanceScore: declaredMatch ? 1 : Math.round(relevanceScore * 100) / 100,
      });
    }

    out.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return out;
  }

  private extractSymbols(files: FileContext[]): SymbolContext[] {
    const symbols: SymbolContext[] = [];
    const pattern = /export\s+(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|interface\s+([A-Za-z_$][\w$]*)|type\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*))/g;
    for (const file of files) {
      const isTscLike = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path);
      if (!isTscLike) continue;
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(file.content)) !== null && symbols.length < 500) {
        const kind = match[1] !== undefined ? 'function'
          : match[2] !== undefined ? 'class'
          : match[3] !== undefined ? 'interface'
          : match[4] !== undefined ? 'type'
          : 'variable';
        const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
        if (name !== undefined) {
          symbols.push({ name, kind, filePath: file.path });
        }
      }
    }
    return symbols;
  }

  private async loadHistory(repoRoot: string): Promise<GitContext[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoRoot, 'log', `-n`, String(MAX_HISTORY_COMMITS), '--pretty=format:%H%x09%s'],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      return stdout
        .split('\n')
        .filter((line) => line.includes('\t'))
        .map((line) => {
          const sep = line.indexOf('\t');
          return {
            commitSha: line.slice(0, sep),
            message: line.slice(sep + 1),
            filesChanged: [],
            timestamp: 0,
          } satisfies GitContext;
        });
    } catch {
      return [];
    }
  }

  private async loadRules(repoRoot: string): Promise<RuleContext[]> {
    const rules: RuleContext[] = [];
    const agentsFile = join(repoRoot, 'AGENTS.md');
    try {
      const content = await fs.readFile(agentsFile, 'utf8');
      rules.push({ source: 'AGENTS.md', rule: content.slice(0, 4000) });
    } catch {
      // no AGENTS.md — no rules to contribute
    }
    return rules;
  }

  static conformance(): AdapterConformance {
    return {
      adapterName: 'filesystem-context',
      portName: 'ContextPort',
      enforcedGuarantees: [
        'declared-inputs-priority',
        'token-budget-enforcement',
        'max-files-limit',
        'relevance-scoring',
        'path-traversal-prevention',
        'symbol-extraction',
        'git-history-loading',
        'agents-md-rules-loading',
      ],
      unenforcedGuarantees: [
        'incremental-context-updates',
        'cross-file-symbol-resolution',
        'semantic-relevance-scoring',
      ],
      limitations: [
        'Max file chars 100K',
        'Max history commits 10',
        'UTF-8 only decoding',
        'No binary file support',
        'Max 500 symbols extracted',
      ],
    };
  }
}

function truncateToTokens(content: string, budget: number): string {
  const chars = budget * 4;
  if (content.length <= chars) return content;
  return `${content.slice(0, chars)}\n…(truncated to stay within token budget)`;
}