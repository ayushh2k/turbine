import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { php } from '@codemirror/lang-php';
import { go } from '@codemirror/lang-go';
import { yaml } from '@codemirror/lang-yaml';

const EXTENSION_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  // Python
  py: 'python', pyi: 'python', pyw: 'python',
  // Rust
  rs: 'rust',
  // Java/Kotlin
  java: 'java', kt: 'java', kts: 'java',
  // C/C++
  c: 'cpp', h: 'cpp', cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', hxx: 'cpp',
  // Web
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'css', less: 'css',
  // Data formats
  json: 'json', jsonc: 'json', json5: 'json',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql',
  xml: 'xml', svg: 'xml', xhtml: 'xml', xsl: 'xml',
  // Other languages
  php: 'php',
  go: 'go',
  yaml: 'yaml', yml: 'yaml',
  // Shell
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  // Config
  toml: 'toml', ini: 'toml', cfg: 'toml',
  dockerfile: 'shell',
  makefile: 'shell',
};

/**
 * Detect language from file path extension.
 */
export function detectLanguage(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  const lowerName = fileName.toLowerCase();

  // Handle special filenames
  if (lowerName === 'dockerfile') return 'shell';
  if (lowerName === 'makefile' || lowerName === 'gnumakefile') return 'shell';
  if (lowerName === 'cargo.toml' || lowerName === 'pyproject.toml') return 'toml';

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? 'plaintext';
}

/**
 * Get a CodeMirror language extension for the detected language.
 */
export function getLanguageExtension(lang: string): Extension | null {
  switch (lang) {
    case 'javascript':
      return javascript({ jsx: true });
    case 'typescript':
      return javascript({ jsx: true, typescript: true });
    case 'python':
      return python();
    case 'rust':
      return rust();
    case 'java':
      return java();
    case 'cpp':
      return cpp();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'json':
      return json();
    case 'markdown':
      return markdown();
    case 'sql':
      return sql();
    case 'xml':
      return xml();
    case 'php':
      return php();
    case 'go':
      return go();
    case 'yaml':
      return yaml();
    default:
      return null;
  }
}
