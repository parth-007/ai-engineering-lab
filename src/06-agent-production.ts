import OpenAI from "openai";
import "dotenv/config";
const client = new OpenAI();
// Explicit budgets — independent, each checked incrementally
interface AgentBudgets {
  maxSteps: number;
  maxToolCalls: number;
  maxCostUsd: number;
  maxWallClockMs: number;
}
interface AgentState {
  status: "running" | "completed" | "budget_exceeded" | "awaiting_approval" | "error";
  stepsUsed: number;
  toolCallsUsed: number;
  costAccumulated: number;
  startedAt: number;
  evidence: string[];
}
const DEFAULT_BUDGETS: AgentBudgets = {
  maxSteps: 6,
  maxToolCalls: 10,
  maxCostUsd: 0.50,
  maxWallClockMs: 30_000,
};

function estimateCallCost(usage: OpenAI.CompletionUsage | undefined): number {
  if (!usage) return 0;
  return (usage.prompt_tokens * 0.15 + usage.completion_tokens * 0.6) / 1_000_000;
}
function checkBudgets(state: AgentState, budgets: AgentBudgets): { ok: boolean; reason?: string } {
  if (state.stepsUsed >= budgets.maxSteps) {
    return { ok: false, reason: `Step budget exhausted (${budgets.maxSteps})` };
  }
  if (state.toolCallsUsed >= budgets.maxToolCalls) {
    return { ok: false, reason: `Tool call budget exhausted (${budgets.maxToolCalls})` };
  }
  if (state.costAccumulated >= budgets.maxCostUsd) {
    return { ok: false, reason: `Cost budget exhausted ($${budgets.maxCostUsd})` };
  }
  if (Date.now() - state.startedAt >= budgets.maxWallClockMs) {
    return { ok: false, reason: `Time budget exhausted (${budgets.maxWallClockMs}ms)` };
  }

  return { ok: true };
}
async function runAgent(userQuery: string, budgets = DEFAULT_BUDGETS) {
  const state: AgentState = {
    status: "running",
    stepsUsed: 0,
    toolCallsUsed: 0,
    costAccumulated: 0,
    startedAt: Date.now(),
    evidence: [],
  };
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are an HR compliance agent. Use tools for specific lookups. " +
        `You have a budget of ${budgets.maxSteps} steps — use them wisely. ` +
        "When you have sufficient information, provide a final answer immediately rather than continuing to search.",
    },
    { role: "user", content: userQuery },
  ];
  while (state.status === "running") {
    // Budget check BEFORE the next call, not after
    const budgetCheck = checkBudgets(state, budgets);

    if (!budgetCheck.ok) {
      state.status = "budget_exceeded";
      console.log(`\nBUDGET EXCEEDED: ${budgetCheck.reason}`);
      console.log(`Evidence gathered so far: ${state.evidence.length} items`);
      console.log(`Cost: $${state.costAccumulated.toFixed(4)}`);
      // Return best-effort result, explicitly flagged as incomplete
      return {
        answer: state.evidence.length > 0
          ? `[INCOMPLETE — budget exceeded] Based on partial investigation:\n${state.evidence.join("\n")}`
          : "[INCOMPLETE — budget exceeded with no evidence gathered]",
        state,
      };
    }
    state.stepsUsed++;
    console.log(`\n--- Step ${state.stepsUsed}/${budgets.maxSteps} | Cost: $${state.costAccumulated.toFixed(4)} ---`);
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: [ /* same tool definitions as before */ ],
      temperature: 0,
    });
    state.costAccumulated += estimateCallCost(response.usage);
    const choice = response.choices[0];
    if (!choice) {
      state.status = "error";
      return { answer: "No response choice returned by the model.", state };
    }
    if (choice.finish_reason === "stop" && !choice.message.tool_calls) {
      state.status = "completed";
      return { answer: choice.message.content, state };
    }
    if (choice.message.tool_calls) {
      messages.push(choice.message);
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") {
          continue;
        }
        state.toolCallsUsed++;
        // Would add tool execution here, same as Stage 4's validated version
        const result = `[simulated result for ${tc.function.name}]`;
        state.evidence.push(`${tc.function.name}: ${result}`);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
    }
  }
}
async function main() {
  const result = await runAgent(
    "Check compliance status of CTR-002 and what they need for Japan tax compliance.",
  );
  console.log("\n=== Final Result ===");
  console.log(result?.answer);
  console.log("\n=== Agent State ===");
  console.log(JSON.stringify(result?.state, null, 2));
}
main().catch(console.error);