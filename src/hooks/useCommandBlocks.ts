import { useState, useCallback, useRef } from 'react';
import type { CommandBlock } from '../types';

/**
 * OSC 133 sequence markers:
 *   \x1b]133;A\x07  — Prompt start
 *   \x1b]133;B\x07  — Command start (user input begins)
 *   \x1b]133;C\x07  — Command executed (output begins)
 *   \x1b]133;D;{exitCode}\x07  — Command finished
 *
 * This is a basic stub/placeholder parser that can be enhanced later.
 */

// Regex patterns for OSC 133 sequences (also supports ST = \x1b\\ terminator)
const OSC_133_PATTERN = /\x1b\]133;([A-D])(?:;([^\x07\x1b]*))?\x07|\x1b\]133;([A-D])(?:;([^\x07\x1b]*))?\x1b\\/g;

interface ParsedMarker {
  type: 'A' | 'B' | 'C' | 'D';
  param?: string;
  offset: number;
}

/**
 * Parse OSC 133 markers from a raw terminal output string.
 */
export function parseOsc133Markers(data: string): ParsedMarker[] {
  const markers: ParsedMarker[] = [];
  let match: RegExpExecArray | null;

  const regex = new RegExp(OSC_133_PATTERN.source, 'g');
  while ((match = regex.exec(data)) !== null) {
    const type = (match[1] ?? match[3]) as ParsedMarker['type'];
    const param = match[2] ?? match[4];
    markers.push({
      type,
      param: param || undefined,
      offset: match.index,
    });
  }

  return markers;
}

/**
 * Convert a sequence of markers into CommandBlock objects.
 * A complete block requires at least A (prompt) → B (command) → C (output) → D (done).
 * Partial sequences are tolerated — we build blocks from whatever we find.
 */
export function buildCommandBlocks(
  data: string,
  markers: ParsedMarker[],
): CommandBlock[] {
  const blocks: CommandBlock[] = [];
  let currentBlock: Partial<CommandBlock> & { _promptOffset?: number; _cmdOffset?: number } = {};
  let lineCounter = 0;

  // Pre-compute line numbers at each offset
  const lineAtOffset = (offset: number): number => {
    let line = 0;
    for (let i = 0; i < offset && i < data.length; i++) {
      if (data[i] === '\n') line++;
    }
    return line;
  };

  for (const marker of markers) {
    switch (marker.type) {
      case 'A': {
        // Prompt start — begin a new potential block
        currentBlock = {
          id: crypto.randomUUID(),
          startLine: lineAtOffset(marker.offset),
          command: '',
          exitCode: null,
          collapsed: false,
          _promptOffset: marker.offset,
        };
        lineCounter = currentBlock.startLine ?? 0;
        break;
      }
      case 'B': {
        // Command input start
        if (currentBlock._promptOffset !== undefined) {
          currentBlock._cmdOffset = marker.offset;
        }
        break;
      }
      case 'C': {
        // Command output start — extract command text between B and C
        if (currentBlock._cmdOffset !== undefined) {
          const cmdText = data.slice(currentBlock._cmdOffset, marker.offset)
            .replace(/\x1b\][^\x07]*\x07/g, '') // strip remaining OSC
            .replace(/\x1b\[[^m]*m/g, '')        // strip SGR
            .trim();
          currentBlock.command = cmdText;
        }
        break;
      }
      case 'D': {
        // Command finished
        const endLine = lineAtOffset(marker.offset);
        if (currentBlock.id) {
          const exitCode = marker.param ? parseInt(marker.param, 10) : null;
          blocks.push({
            id: currentBlock.id,
            command: currentBlock.command ?? '',
            startLine: currentBlock.startLine ?? lineCounter,
            endLine,
            exitCode: isNaN(exitCode as number) ? null : exitCode,
            collapsed: false,
          });
        }
        currentBlock = {};
        break;
      }
    }
  }

  return blocks;
}

/**
 * React hook for tracking command blocks from terminal output.
 * This is a basic stub that accumulates output and parses on demand.
 */
export function useCommandBlocks() {
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);
  const bufferRef = useRef('');

  const appendOutput = useCallback((data: string) => {
    const updated = bufferRef.current + data;
    bufferRef.current = updated;
    const markers = parseOsc133Markers(updated);
    if (markers.length > 0) {
      const newBlocks = buildCommandBlocks(updated, markers);
      if (newBlocks.length > 0) {
        setBlocks(newBlocks);
      }
    }
  }, []);

  const toggleCollapse = useCallback((blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, collapsed: !b.collapsed } : b,
      ),
    );
  }, []);

  const clearBlocks = useCallback(() => {
    setBlocks([]);
    bufferRef.current = '';
  }, []);

  return { blocks, appendOutput, toggleCollapse, clearBlocks };
}
