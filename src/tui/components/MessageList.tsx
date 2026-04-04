import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../commands/registry.js";

interface MessageListProps {
  messages: ChatMessage[];
  height: number;
  scrollOffset: number;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageList({ messages, height, scrollOffset }: MessageListProps) {
  const visibleMessages = messages.slice(-height - scrollOffset, messages.length - scrollOffset);

  return (
    <Box flexDirection="column" height={height} overflowY="hidden">
      {visibleMessages.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>Type /help to see available commands</Text>
        </Box>
      ) : (
        visibleMessages.map((msg, idx) => (
          <Box key={idx} flexDirection="column">
            {msg.role === "system" && (
              <Box>
                <Text dimColor>[{formatTime(msg.timestamp)}] </Text>
                <Text dimColor>{msg.content}</Text>
              </Box>
            )}
            {msg.role === "user" && (
              <Box>
                <Text dimColor>[{formatTime(msg.timestamp)}] </Text>
                <Text color="green">{msg.content}</Text>
              </Box>
            )}
            {msg.role === "assistant" && (
              <Box flexDirection="column">
                <Box>
                  <Text dimColor>[{formatTime(msg.timestamp)}] </Text>
                  <Text color="magenta">assistant:</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text>{msg.content}</Text>
                </Box>
              </Box>
            )}
          </Box>
        ))
      )}
      {scrollOffset > 0 && (
        <Text dimColor>  ... {scrollOffset} more messages above (scroll with Ctrl+U/D)</Text>
      )}
    </Box>
  );
}
