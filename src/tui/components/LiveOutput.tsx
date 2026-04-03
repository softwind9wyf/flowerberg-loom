import React from "react";
import { Box, Text } from "ink";

interface LiveOutputProps {
  chunks: string[];
  maxLines?: number;
}

export function LiveOutput({ chunks, maxLines = 10 }: LiveOutputProps) {
  const visible = chunks.slice(-maxLines);

  if (visible.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold underline>Output</Text>
        <Text dimColor>Waiting for output...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold underline>Output</Text>
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="dim" paddingX={1}>
        {visible.map((line, i) => (
          <Text key={i} wrap="truncate">{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
