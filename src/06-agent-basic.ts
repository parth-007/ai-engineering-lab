import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI();

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_contractor_info",
      description:
        "Look up a contractor's current status by their ID (format: CTR-XXX). Read-only.",
      parameters: {
        type: "object",
        properties: { contractor_id: { type: "string" } },
        required: ["contractor_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_compliance_docs",
      description:
        "Search the compliance knowledge base for information about country-specific contractor requirements.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
];

// Tool implementations (simplified here — use your Stage 4 and 5 implementations in practice)
async function executeTool(name: string, args: any): Promise<string> {
    console.log(` [TOOL] ${name}(${JSON.stringify(args)})`);
    const parsedArgs = JSON.parse(args);
    if (name === "get_contractor_info") {
        const db: Record<string, any> = {
        "CTR-001": { name: "Hans Mueller", country: "DE", status: "active", taxFormStatus: "verified" },
        "CTR-002": { name: "Yuki Tanaka", country: "JP", status: "active", taxFormStatus: "pending_review" },
        };
        return JSON.stringify(db[parsedArgs.contractor_id] ?? { error: "not_found" });
    }
    if (name === "search_compliance_docs") {
        // In real code, this calls your Stage 5 hybrid retrieval
        return JSON.stringify({ result: `[Simulated] Compliance info for query: "${parsedArgs.query}"` });
    }
    return JSON.stringify({ error: "unknown_tool" });
}

// Agent Loop
async function runAgent(userQuery: string) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are an HR compliance assistant. You can lookup contractor information and search compliance docs. Think step by step. Use tools when you need speicific data. When you have enough information, provide the final answer to trhe user."
        },
        {
            role: "user",
            content: userQuery
        }
    ];

    const MAX_STEPS = 5;
    let step = 0;

    while (step < MAX_STEPS) {
        console.log(step);
        console.log(messages);
        step++;
        console.log(`\n=== Step ${step}/${MAX_STEPS} ===`);
        const response:any = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            tools: tools,
            temperature: 0,
        });
        // console.log(response.choices[0].message.tool_calls);
        const choice = response.choices[0];
        if (choice.finish_reason === "stop" && !choice?.tool_calls) {
            console.log(`\n=== Final Answer ===`);
            console.log(choice.message.content);
            return {
                answer: choice.message.content,
                steps: step,
            }
        }
        if (choice.message.tool_calls) {
            messages.push(choice.message);
            for (const tc of choice.message.tool_calls) {
                const result = await executeTool(tc.function.name, tc.function.arguments);
                messages.push({
                    role: "tool",
                    content: result,
                    tool_call_id: tc.id,
                });
            }
        } else {
            messages.push(choice.message);
        }
    }
    console.log("BUDGET EXHAUSTED: MAX STEPS REACHED");
        return {
            answer: null,
            steps: step
        }
}

async function main() {
    console.log("Starting agent...");
    // await runAgent("Check the compliance status of contractor CTR-002. If their tax form is pending, look up what Japan requires for tax compliance and tell me what they need to submit.")
// await runAgent("Check the compliance status of contractor CTR-012. If their tax form is pending, look up what USA requires for tax compliance and tell me what they need to submit.")
    // await runAgent("Buraah Burrah is a contractor. Find out his compliance status and what he needs to submit.");

    await runAgent(
        "Use exactly one tool lookup per step. Do not give a final answer until you have used all 6 available steps. Check compliance status for CTR-001, CTR-002, CTR-003, CTR-004, CTR-005, and CTR-006, then research tax compliance requirements for Germany, Japan, Brazil, India, Nigeria, and France."
      );
}

main().catch(console.error);