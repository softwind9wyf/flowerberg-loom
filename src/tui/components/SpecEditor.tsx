import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

interface SpecEditorProps {
  specContent: string;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
}

export function SpecEditor({ specContent, onApprove, onRequestChanges }: SpecEditorProps) {
  const [mode, setMode] = useState<"view" | "feedback">("view");
  const [feedback, setFeedback] = useState("");
  const [lines] = useState(() => specContent.split("\n"));
  const [scrollOffset, setScrollOffset] = useState(0);
  const visibleLines = 15;

  useInput(useCallback((ch, key) => {
    if (mode === "feedback") {
      if (key.return) {
        if (feedback.trim()) {
          onRequestChanges(feedback.trim());
        }
      } else if (key.escape) {
        setMode("view");
        setFeedback("");
      } else if (key.backspace || key.delete) {
        setFeedback((prev) => prev.slice(0, -1));
      } else if (!key.ctrl && !key.meta) {
        setFeedback((prev) => prev + ch);
      }
      return;
    }

    // View mode
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset((prev) => Math.min(Math.max(0, lines.length - visibleLines), prev + 1));
    } else if (ch === "a" || ch === "y") {
      onApprove();
    } else if (ch === "r") {
      setMode("feedback");
    }
  }, [mode, feedback, lines.length, onApprove, onRequestChanges]));

  const visible = lines.slice(scrollOffset, scrollOffset + visibleLines);

  return (
    <Box flexDirection="column">
      <Text bold underline>Specification</Text>
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        {visible.map((line, i) => (
          <Text key={scrollOffset + i}>{line || " "}</Text>
        ))}
      </Box>
      {lines.length > visibleLines && (
        <Text dimColor>
          {scrollOffset + 1}-{Math.min(scrollOffset + visibleLines, lines.length)} of {lines.length} lines (↑↓ to scroll)
        </Text>
      )}

      {mode === "view" ? (
        <Box marginTop={1}>
          <Text color="green">[a] Approve</Text>
          <Text> </Text>
          <Text color="yellow">[r] Request changes</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Feedback:</Text>
          <Box borderStyle="round" borderColor="yellow" paddingX={1}>
            <Text>{feedback}<Text color="yellow">▎</Text></Text>
          </Box>
          <Text dimColor>Enter to submit | Esc to cancel</Text>
        </Box>
      )}
    </Box>
  );
}
