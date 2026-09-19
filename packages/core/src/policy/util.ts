// Pure matching helpers shared by RUNTIME_FLOOR and the default policy engine.
// No imports beyond contracts — these are string/pattern logic only.
import type { ActionRequest } from '@runforge/contracts';

export const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Za-z ]*PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
];

export function isGitCommand(command: string): boolean {
  return command.trim().split(/\s+/)[0] === 'git';
}

export function commandTokens(command: string): string[] {
  return command.trim().split(/\s+/).filter((t) => t.length > 0);
}

export function hasToken(command: string, token: string): boolean {
  return commandTokens(command).includes(token);
}

export function isSecretFile(target: string): boolean {
  const base = target.split(/[\\/]/).pop() ?? target;
  if (base.startsWith('.env')) return true;
  if (/\.(pem|key|p12|pfx|jks)$/i.test(base)) return true;
  if (/^id_(rsa|ed25519|ecdsa|dsa)$/.test(base)) return true;
  return /(^|[\\/])secrets([\\/]|$)/i.test(target);
}

export function commandText(action: ActionRequest): string {
  const argCommand = action.args?.command;
  if (typeof argCommand === 'string') return argCommand;
  if (typeof action.target === 'string') return action.target;
  return '';
}

export function actionText(action: ActionRequest): string {
  let text = `${action.target} ${JSON.stringify(action.args ?? {})}`;
  const command = action.args?.command;
  if (typeof command === 'string') text = `${text} ${command}`;
  return text;
}

export function containsSecret(action: ActionRequest): boolean {
  const haystack = actionText(action);
  return SECRET_PATTERNS.some((re) => re.test(haystack));
}

const PROTECTED_FILE =
  /(^|[\\/])(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json|Dockerfile[^\\/]*|\.github[\\/]|workflows[\\/]|\.gitlab-ci\.yml|forge\.(yaml|yml)|\.dependency-cruiser\.cjs|eslint\.config\.(js|mjs|ts|mts|cts)|tsconfig[^\\/]*\.json|vitest\.config\.(js|mjs|ts))/;

export function isProtectedFile(target: string): boolean {
  return PROTECTED_FILE.test(target);
}

export function globToRegExp(pattern: string): RegExp {
  const chars = [...pattern];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === '*') {
      if (chars[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/\\\\]*';
      }
    } else if (c === '?') {
      out += '[^/\\\\]';
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchResource(pattern: string, target: string): boolean {
  if (pattern.startsWith('re:')) {
    try {
      return new RegExp(pattern.slice(3)).test(target);
    } catch {
      return false;
    }
  }
  return globToRegExp(pattern).test(target);
}