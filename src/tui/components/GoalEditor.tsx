import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface GoalEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function GoalEditor({ initialContent, onSave, onCancel }: GoalEditorProps) {
  const [lines, setLines] = useState<string[]>(() => {
    if (!initialContent.trim()) return [""];
    return initialContent.split("\n");
  });
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);

  useInput((ch, key) => {
    // Ctrl+S or Escape → save
    if ((key.ctrl && ch === "s") || key.escape) {
      onSave(lines.join("\n"));
      return;
    }

    // Ctrl+C → cancel
    if (key.ctrl && ch === "c") {
      onCancel();
      return;
    }

    // Enter → new line
    if (key.return) {
      setLines((prev) => {
        const currentLine = prev[cursorRow] ?? "";
        const before = currentLine.slice(0, cursorCol);
        const after = currentLine.slice(cursorCol);
        const newLines = [...prev];
        newLines[cursorRow] = before;
        newLines.splice(cursorRow + 1, 0, after);
        return newLines;
      });
      setCursorRow((r) => r + 1);
      setCursorCol(0);
      return;
    }

    // Backspace
    if (key.backspace) {
      if (cursorCol > 0) {
        setLines((prev) => {
          const newLines = [...prev];
          const line = newLines[cursorRow] ?? "";
          newLines[cursorRow] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
          return newLines;
        });
        setCursorCol((c) => c - 1);
      } else if (cursorRow > 0) {
        // Merge with previous line
        setLines((prev) => {
          const newLines = [...prev];
          const prevLine = newLines[cursorRow - 1] ?? "";
          const curLine = newLines[cursorRow] ?? "";
          setCursorCol(prevLine.length);
          newLines[cursorRow - 1] = prevLine + curLine;
          newLines.splice(cursorRow, 1);
          return newLines;
        });
        setCursorRow((r) => r - 1);
      }
      return;
    }

    // Delete
    if (key.delete) {
      const currentLine = lines[cursorRow] ?? "";
      if (cursorCol < currentLine.length) {
        setLines((prev) => {
          const newLines = [...prev];
          const line = newLines[cursorRow] ?? "";
          newLines[cursorRow] = line.slice(0, cursorCol) + line.slice(cursorCol + 1);
          return newLines;
        });
      } else if (cursorRow < lines.length - 1) {
        setLines((prev) => {
          const newLines = [...prev];
          newLines[cursorRow] = (newLines[cursorRow] ?? "") + (newLines[cursorRow + 1] ?? "");
          newLines.splice(cursorRow + 1, 1);
          return newLines;
        });
      }
      return;
    }

    // Arrow keys
    if (key.upArrow) {
      if (cursorRow > 0) {
        setCursorRow((r) => r - 1);
        setCursorCol((c) => Math.min(c, (lines[cursorRow - 1] ?? "").length));
      }
      return;
    }
    if (key.downArrow) {
      if (cursorRow < lines.length - 1) {
        setCursorRow((r) => r + 1);
        setCursorCol((c) => Math.min(c, (lines[cursorRow + 1] ?? "").length));
      }
      return;
    }
    if (key.leftArrow) {
      if (cursorCol > 0) setCursorCol((c) => c - 1);
      return;
    }
    if (key.rightArrow) {
      setCursorCol((c) => Math.min(c + 1, (lines[cursorRow] ?? "").length));
      return;
    }

    // Regular character
    if (ch && !key.ctrl && !key.meta) {
      setLines((prev) => {
        const newLines = [...prev];
        const line = newLines[cursorRow] ?? "";
        newLines[cursorRow] = line.slice(0, cursorCol) + ch + line.slice(cursorCol);
        return newLines;
      });
      setCursorCol((c) => c + 1);
    }
  });

  // Render visible portion of lines
  const maxVisible = 10;
  const startRow = Math.max(0, Math.min(cursorRow - Math.floor(maxVisible / 2), Math.max(0, lines.length - maxVisible)));
  const visibleLines = lines.slice(startRow, startRow + maxVisible);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text bold color="yellow">Edit Goal</Text>
        <Text dimColor>Enter=NewLine | Esc/Ctrl+S=Save | Ctrl+C=Cancel</Text>
        <Text> </Text>
        {visibleLines.map((line, idx) => {
          const realIdx = startRow + idx;
          const isCurrentLine = realIdx === cursorRow;
          if (isCurrentLine) {
            const before = line.slice(0, cursorCol);
            const cursor = line.slice(cursorCol, cursorCol + 1) || " ";
            const after = line.slice(cursorCol + 1);
            return (
              <Box key={realIdx}>
                <Text>{before}</Text>
                <Text color="cyan" inverse>{cursor}</Text>
                <Text>{after}</Text>
              </Box>
            );
          }
          return <Text key={realIdx}>{line || " "}</Text>;
        })}
      </Box>
      <Text dimColor> {cursorRow + 1}:{cursorCol} | {lines.length} lines</Text>
    </Box>
  );
}
