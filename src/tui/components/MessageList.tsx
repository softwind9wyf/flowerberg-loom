import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../commands/registry.js";

interface MessageListProps {
  messages: ChatMessage[];
  height: number;
  scrollOffset: number;
  width?: number;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Split text into lines that fit within maxWidth */
function wrapLines(text: string, maxWidth: number): string[] {
  const rawLines = text.split("\n");
  const result: string[] = [];
  for (const line of rawLines) {
    if (line.length <= maxWidth) {
      result.push(line);
    } else {
      // Hard wrap
      for (let i = 0; i < line.length; i += maxWidth) {
        result.push(line.slice(i, i + maxWidth));
      }
    }
  }
  return result;
}

interface RenderedMessage {
  lines: { text: string; color?: string; dimColor?: boolean; bold?: boolean }[];
}

function renderMessage(msg: ChatMessage, contentWidth: number): RenderedMessage {
  const lines: RenderedMessage["lines"] = [];
  const time = formatTime(msg.timestamp);

  if (msg.role === "system") {
    const wrapped = wrapLines(msg.content, contentWidth - time.length - 3);
    for (const line of wrapped) {
      lines.push({ text: `[${time}] `, dimColor: true });
      lines.push({ text: line, dimColor: true });
    }
  } else if (msg.role === "user") {
    const wrapped = wrapLines(msg.content, contentWidth - time.length - 3);
    for (const line of wrapped) {
      lines.push({ text: `[${time}] `, dimColor: true });
      lines.push({ text: line, color: "green" });
    }
  } else {
    // assistant
    lines.push({ text: `[${time}] `, dimColor: true });
    lines.push({ text: "assistant:", color: "magenta", bold: true });
    const wrapped = wrapLines(msg.content, contentWidth - 2);
    for (const line of wrapped) {
      lines.push({ text: `  ${line}` });
    }
  }

  return { lines };
}

export function MessageList({ messages, height, scrollOffset, width = 80 }: MessageListProps) {
  // Pre-render all messages into flat line arrays
  const rendered = useMemo(() => {
    return messages.map((msg) => renderMessage(msg, width));
  }, [messages, width]);

  // Total line count per message
  const lineCounts = rendered.map((m) => m.lines.length);

  // Build flat line list for scrolling
  type FlatLine = { msgIdx: number; lineIdx: number };
  const flatLines: FlatLine[] = [];
  for (let mi = 0; mi < rendered.length; mi++) {
    for (let li = 0; li < rendered[mi].lines.length; li++) {
      flatLines.push({ msgIdx: mi, lineIdx: li });
    }
  }

  const visibleStart = Math.max(0, flatLines.length - height - scrollOffset);
  const visibleEnd = flatLines.length - scrollOffset;
  const visible = flatLines.slice(visibleStart, visibleEnd);

  return (
    <Box flexDirection="column" height={height}>
      {visible.length === 0 ? (
        <Box padding={1}>
          <Text dimColor>Type /help to see available commands</Text>
        </Box>
      ) : (
        visible.map(({ msgIdx, lineIdx }, i) => {
          const line = rendered[msgIdx].lines[lineIdx];
          return (
            <Text
              key={`${msgIdx}-${lineIdx}-${i}`}
              color={line.color as any}
              dimColor={line.dimColor}
              bold={line.bold}
            >
              {line.text}
            </Text>
          );
        })
      )}
      {scrollOffset > 0 && (
        <Text dimColor>  ... {scrollOffset} more lines above (Ctrl+U/D to scroll)</Text>
      )}
    </Box>
  );
}
