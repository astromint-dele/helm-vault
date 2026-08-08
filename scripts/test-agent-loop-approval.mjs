// Test harness for the agent loop's approval prompt: spawns agent-loop.js as a real child
// process and answers "yes" only once the prompt actually appears in stdout. A naive
// `echo yes | npm run agent-loop` doesn't work here — echo closes stdin immediately, and
// Node's readline interface auto-closes on EOF before the async drift/LLM work (which
// takes a few real seconds) finishes and the prompt is actually asked, throwing
// ERR_USE_AFTER_CLOSE. This waits for the real prompt instead of guessing the timing.
import { spawn } from "node:child_process";

const child = spawn("node", ["scripts/agent-loop.js"], {
  env: { ...process.env, AGENT_LOOP_MAX_CYCLES: process.env.AGENT_LOOP_MAX_CYCLES || "1" },
  cwd: process.cwd(),
});

let answered = false;
child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!answered && text.includes("Execute this trade?")) {
    answered = true;
    child.stdin.write((process.env.TEST_APPROVAL_ANSWER || "yes") + "\n");
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  console.log(`\n[test harness] child exited with code ${code}`);
  process.exit(code ?? 0);
});
