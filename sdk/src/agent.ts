import path from "node:path";
import { Agent, CursorAgentError, type RunResult } from "@cursor/sdk";
import { loadInstructions, wrapTaskWithInstructions } from "./instructions.js";

export type KodaelusRunOptions = {
  apiKey: string;
  task: string;
  /** Target project directory (default: process.cwd()). */
  cwd?: string;
  modelId?: string;
  streamStdout?: boolean;
};

export type KodaelusRunOutcome = {
  agentId: string;
  runId: string;
  result: RunResult;
};

export async function runKodaelus(
  options: KodaelusRunOptions,
): Promise<KodaelusRunOutcome> {
  const projectCwd = path.resolve(options.cwd ?? process.cwd());
  const instructions = await loadInstructions({ cwd: projectCwd });
  const prompt = wrapTaskWithInstructions(instructions, options.task);
  const modelId = options.modelId ?? "composer-2.5";

  await using agent = await Agent.create({
    apiKey: options.apiKey,
    model: { id: modelId },
    local: {
      cwd: projectCwd,
      settingSources: [],
    },
  });

  const run = await agent.send(prompt);
  const agentId = agent.agentId;
  const runId = run.id;

  if (options.streamStdout !== false) {
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      }
    }
  }

  try {
    const result = await run.wait();
    if (result.status === "error") {
      console.error(`\n[kodaelus] run failed: ${result.id}`);
      process.exitCode = 2;
    }
    return { agentId, runId, result };
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(
        `[kodaelus] startup failed: ${err.message} (retryable=${err.isRetryable})`,
      );
      process.exitCode = 1;
      throw err;
    }
    throw err;
  }
}
