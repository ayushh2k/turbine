import { describe, it, expect } from 'vitest';
import { detectLevel } from './logParser';

describe('detectLevel', () => {
  it('detects ERROR level (case-insensitive)', () => {
    expect(detectLevel('2024-01-01 ERROR something failed')).toBe('error');
    expect(detectLevel('error: connection refused')).toBe('error');
    expect(detectLevel('Error in module')).toBe('error');
  });

  it('detects WARN level', () => {
    expect(detectLevel('2024-01-01 WARN disk space low')).toBe('warn');
    expect(detectLevel('warn: deprecated API')).toBe('warn');
  });

  it('detects WARNING as warn level', () => {
    expect(detectLevel('WARNING: memory usage high')).toBe('warn');
    expect(detectLevel('2024-01-01 warning something')).toBe('warn');
  });

  it('detects INFO level', () => {
    expect(detectLevel('2024-01-01 INFO server started')).toBe('info');
    expect(detectLevel('info: listening on port 3000')).toBe('info');
  });

  it('detects DEBUG level', () => {
    expect(detectLevel('2024-01-01 DEBUG request payload')).toBe('debug');
    expect(detectLevel('debug: cache miss')).toBe('debug');
  });

  it('detects TRACE level', () => {
    expect(detectLevel('2024-01-01 TRACE entering function')).toBe('trace');
    expect(detectLevel('trace: method call')).toBe('trace');
  });

  it('returns info as default when no keyword found', () => {
    expect(detectLevel('just a plain log line')).toBe('info');
    expect(detectLevel('')).toBe('info');
    expect(detectLevel('some output without level')).toBe('info');
  });

  it('matches the first keyword by position in the line', () => {
    expect(detectLevel('ERROR then WARN later')).toBe('error');
    expect(detectLevel('WARN before ERROR')).toBe('warn');
    expect(detectLevel('DEBUG: got ERROR response')).toBe('debug');
    expect(detectLevel('TRACE INFO DEBUG')).toBe('trace');
  });

  it('handles mixed case keywords', () => {
    expect(detectLevel('ErRoR in processing')).toBe('error');
    expect(detectLevel('WaRnInG: something')).toBe('warn');
  });
});
