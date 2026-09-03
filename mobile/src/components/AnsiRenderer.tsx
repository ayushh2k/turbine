import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';

interface AnsiRendererProps {
  rawText: string;
  fontSize?: number;
}

interface TextChunk {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

const ANSI_COLORS: Record<number, string> = {
  30: '#4f5b66', // Black / Gray
  31: '#ff5370', // Red
  32: '#c3e88d', // Green
  33: '#ffcb6b', // Yellow
  34: '#82aaff', // Blue
  35: '#c792ea', // Magenta
  36: '#89ddff', // Cyan
  37: '#eeffff', // White
  90: '#676e95', // Bright Black
  91: '#f07178', // Bright Red
  92: '#c3e88d', // Bright Green
  93: '#ffcb6b', // Bright Yellow
  94: '#82aaff', // Bright Blue
  95: '#c792ea', // Bright Magenta
  96: '#89ddff', // Bright Cyan
  97: '#ffffff', // Bright White
};

export const AnsiRenderer: React.FC<AnsiRendererProps> = ({ rawText, fontSize = 11 }) => {
  const chunks = useMemo(() => {
    if (!rawText) return [];

    const result: TextChunk[] = [];
    const ansiRegex = /\x1b\[([0-9;]*)m/g;

    let lastIndex = 0;
    let currentColor: string | undefined;
    let currentBold = false;
    let currentDim = false;

    let match;
    while ((match = ansiRegex.exec(rawText)) !== null) {
      const plain = rawText.substring(lastIndex, match.index);
      if (plain.length > 0) {
        result.push({
          text: plain,
          color: currentColor,
          bold: currentBold,
          dim: currentDim,
        });
      }

      const codes = match[1] ? match[1].split(';').map(Number) : [0];
      for (const code of codes) {
        if (code === 0) {
          currentColor = undefined;
          currentBold = false;
          currentDim = false;
        } else if (code === 1) {
          currentBold = true;
        } else if (code === 2) {
          currentDim = true;
        } else if (ANSI_COLORS[code]) {
          currentColor = ANSI_COLORS[code];
        }
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < rawText.length) {
      result.push({
        text: rawText.substring(lastIndex),
        color: currentColor,
        bold: currentBold,
        dim: currentDim,
      });
    }

    return result;
  }, [rawText]);

  if (chunks.length === 0) {
    return <Text style={[styles.terminalText, { fontSize }]}>{rawText}</Text>;
  }

  return (
    <Text style={[styles.terminalText, { fontSize }]}>
      {chunks.map((chunk, idx) => (
        <Text
          key={idx}
          style={[
            chunk.color ? { color: chunk.color } : styles.defaultColor,
            chunk.bold && styles.bold,
            chunk.dim && styles.dim,
          ]}
        >
          {chunk.text}
        </Text>
      ))}
    </Text>
  );
};

const styles = StyleSheet.create({
  terminalText: {
    fontFamily: 'Courier',
    lineHeight: 16,
  },
  defaultColor: {
    color: '#d6deeb',
  },
  bold: {
    fontWeight: '700',
  },
  dim: {
    opacity: 0.6,
  },
});
