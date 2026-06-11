import { describe, it, expect } from 'vitest';
import { toRustLogSource, fromRustLogSource, generateCommand } from './logStreamManager';
import type { LogSourceConfig } from '../types';

describe('generateCommand flood guards', () => {
  it('defaults docker logs to --tail 1000', () => {
    const cmd = generateCommand({
      id: 's',
      paneId: 'p',
      sourceType: 'docker_container',
      displayName: 'd',
      color: null,
      params: { containerNameOrId: 'web' },
      sortOrder: 0,
    });
    expect(cmd).toBe('docker logs -f --tail 1000 web');
  });

  it('defaults kubectl logs to --tail=1000', () => {
    const cmd = generateCommand({
      id: 's',
      paneId: 'p',
      sourceType: 'kubernetes_pod',
      displayName: 'k',
      color: null,
      params: { podName: 'pod-1' },
      sortOrder: 0,
    });
    expect(cmd).toBe('kubectl logs -f pod-1 --tail=1000');
  });
});

describe('log source wire mapping', () => {
  const source: LogSourceConfig = {
    id: 'src-1',
    paneId: 'pane-1',
    sourceType: 'local_file',
    displayName: 'App Log',
    color: '#00e5c8',
    params: { filePath: '/var/log/app.log' },
    sortOrder: 0,
  };

  it('maps to the Rust snake_case shape with params serialized', () => {
    const rust = toRustLogSource(source);
    expect(rust).toEqual({
      id: 'src-1',
      pane_id: 'pane-1',
      source_type: 'local_file',
      display_name: 'App Log',
      color: '#00e5c8',
      params_json: '{"filePath":"/var/log/app.log"}',
      sort_order: 0,
    });
  });

  it('round-trips back to the frontend shape', () => {
    expect(fromRustLogSource(toRustLogSource(source))).toEqual(source);
  });

  it('tolerates corrupt params_json', () => {
    const rust = { ...toRustLogSource(source), params_json: 'not json' };
    expect(fromRustLogSource(rust).params).toEqual({});
  });
});
