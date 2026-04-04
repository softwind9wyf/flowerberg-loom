import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { Writable } from "stream";
import * as readline from "readline";

interface CommandInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
}

/** Calculate visible width of a string in terminal (CJK = 2 columns) */
function strWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2329 && code <= 0x232a) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

export function CommandInput({ onSubmit, placeholder = "Type a message or /command..." }: CommandInputProps) {
  const [input, setInput] = useState("");
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  useEffect(() => {
    if (!process.stdin.isTTY) return;

    const rl = readline.createInterface({
      input: process.stdin,
      output: new Writable({
        write(_chunk: Buffer, _enc: string, cb: () => void) { cb(); },
      }),
    });

    // We don't use rl's prompt/display, just capture line events
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }
      setInput("");
    });

    // Also capture raw keystrokes for real-time display
    const stdin = process.stdin;
    if (stdin.isRaw) {
      const rawHandler = (ch: Buffer) => {
        const s = ch.toString("utf-8");
        // Backspace
        if (s === "\x7f" || s === "\b") {
          setInput((prev) => prev.slice(0, -1));
          return;
        }
        // Enter
        if (s === "\r" || s === "\n") {
          return; // handled by rl 'line' event
        }
        // Escape
        if (s === "\x1b") {
          setInput("");
          return;
        }
        // Ctrl+C etc — skip control chars
        if (s.length === 1 && s.charCodeAt(0) < 32) {
          return;
        }
        // Normal printable character (including CJK from IME)
        setInput((prev) => prev + s);
      };

      stdin.on("data", rawHandler);
      return () => {
        stdin.removeListener("data", rawHandler);
        rl.close();
      };
    }

    return () => {
      rl.close();
    };
  }, [onSubmit]);

  // Available width for input text
  const usedWidth = 8; // border(2) + padding(2) + prompt(1) + space(1) + cursor(1) + margin(1)
  const maxInputWidth = termWidth - usedWidth;
  const inputDisplayWidth = strWidth(input);

  // If input is too long, show only the tail
  let displayInput = input;
  if (inputDisplayWidth > maxInputWidth) {
    let w = 0;
    for (let i = input.length - 1; i >= 0; i--) {
      const cw = strWidth(input[i]);
      if (w + cw > maxInputWidth) {
        displayInput = input.slice(i + 1);
        break;
      }
      w += cw;
    }
  }

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} width={termWidth}>
      <Text color="cyan">{">"}</Text>
      <Text> </Text>
      {input.length > 0 ? (
        <Text>{displayInput}</Text>
      ) : (
        <Text dimColor>{placeholder}</Text>
      )}
      <Text color="cyan">|</Text>
    </Box>
  );
}
