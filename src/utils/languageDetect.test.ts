import { describe, it, expect } from 'vitest';
import { detectLanguage } from './languageDetect';

describe('detectLanguage', () => {
  it.each([
    ['app.js', 'javascript'],
    ['index.jsx', 'javascript'],
    ['module.mjs', 'javascript'],
    ['server.cjs', 'javascript'],
    ['app.ts', 'typescript'],
    ['Component.tsx', 'typescript'],
    ['lib.mts', 'typescript'],
    ['script.py', 'python'],
    ['main.rs', 'rust'],
    ['App.java', 'java'],
    ['main.kt', 'java'],
    ['code.c', 'cpp'],
    ['code.cpp', 'cpp'],
    ['header.h', 'cpp'],
    ['header.hpp', 'cpp'],
    ['index.html', 'html'],
    ['page.htm', 'html'],
    ['App.vue', 'html'],
    ['App.svelte', 'html'],
    ['style.css', 'css'],
    ['style.scss', 'css'],
    ['data.json', 'json'],
    ['readme.md', 'markdown'],
    ['query.sql', 'sql'],
    ['config.xml', 'xml'],
    ['icon.svg', 'xml'],
    ['index.php', 'php'],
    ['main.go', 'go'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
    ['script.sh', 'shell'],
    ['script.bash', 'shell'],
    ['script.zsh', 'shell'],
    ['Cargo.toml', 'toml'],
    ['config.ini', 'toml'],
  ])('detects %s as %s', (file, expected) => {
    expect(detectLanguage(file)).toBe(expected);
  });

  it('handles full paths', () => {
    expect(detectLanguage('/home/user/project/src/main.rs')).toBe('rust');
    expect(detectLanguage('C:\\Users\\code\\app.tsx')).toBe('typescript');
  });

  it('handles special filenames', () => {
    expect(detectLanguage('Dockerfile')).toBe('shell');
    expect(detectLanguage('Makefile')).toBe('shell');
    expect(detectLanguage('GNUmakefile')).toBe('shell');
  });

  it('returns plaintext for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBe('plaintext');
    expect(detectLanguage('noextension')).toBe('plaintext');
  });

  it('is case-insensitive for extensions', () => {
    expect(detectLanguage('App.TSX')).toBe('typescript');
    expect(detectLanguage('STYLE.CSS')).toBe('css');
  });
});
