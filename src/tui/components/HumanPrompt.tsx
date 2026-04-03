import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

interface HumanPromptProps {
  prompt: string;
  onSubmit: (input: string) => void;
}

export function HumanPrompt({ prompt, onSubmit }: HumanPromptProps) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useInput(useCallback((ch, key) => {
    if (submitted) return;
    if (key.return) {
      if (input.trim()) {
        setSubmitted(true);
        onSubmit(input.trim());
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta) {
      setInput((prev) => prev + ch);
    }
  }, [input, submitted, onSubmit]));

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">Input Required</Text>
      <Box marginTop={1}>
        <Text>{prompt}</Text>
      </Box>
      <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text>
          {input}
          {!submitted && <Text color="yellow">▎</Text>}
        </Text>
      </Box>
      {submitted ? (
        <Box marginTop={1}><Text color="green">Submitted!</Text></Box>
      ) : (
        <Box marginTop={1}><Text dimColor>Press Enter to submit</Text></Box>
      )}
    </Box>
  );
}
