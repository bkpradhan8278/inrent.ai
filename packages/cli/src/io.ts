import { createInterface } from "node:readline";

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** Whether stdin is an interactive terminal. */
  interactive: boolean;
  /** Prompts for a line of input; `hidden` suppresses echo (for secrets). */
  prompt: (question: string, opts?: { hidden?: boolean }) => Promise<string>;
  /** Reads all of stdin (for `echo $KEY | inrent login`). */
  readStdin: () => Promise<string>;
}

export function processIo(): Io {
  return {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    interactive: Boolean(process.stdin.isTTY),
    prompt: (question, opts = {}) => (opts.hidden && process.stdin.isTTY ? promptHidden(question) : promptLine(question)),
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const c of process.stdin) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const done = (fn: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new Error("Cancelled")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
