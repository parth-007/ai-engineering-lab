import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI();

const SYSTEM_PROMPT: OpenAI.Chat.ChatCompletionMessageParam = {
  role: "system",
  content:
    "You are an HR compliance assistant for a global platform. " +
    "You help internal teams understand contractor requirements by country.",
};

const TOKEN_BUDGET = {
  system: 100, // System prompt
  summary: 300, // compressed older context
  recentTurns: 800, // last few turns, verbatim
  output: 500, // reserved for model response
  total: 1700, // well under any model's limit, deliberately
};

let conversationSummary = "";
let recentMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
const MAX_RECENT_TURNS = 6; // 3 user + 3 assistant

async function summarizeOlderTurns(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  existingSummary: string,
) {
  const toSummarize = messages
    .map(
      (m) =>
        `${m.role}: ${typeof m.content === "string" ? m.content : "[complex]"}`,
    )
    .join("\n");
  const resp: any = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Summarize this conversation history into a concise paragrap preserving all key facts (countries discussed, specific requirements mentioned, decisions made). This summary will be used as context for future turns.",
      },
      {
        role: "user",
        content: existingSummary
          ? `Previous summary:\n${existingSummary}\n\nNew turns to incorporate:\n${toSummarize}`
          : `Conversation to summarize:\n${toSummarize}`,
      },
    ],
    temperature: 0,
    max_tokens: TOKEN_BUDGET.summary,
  });
  return resp.choices[0].message.content ?? "";
}

async function chat(userMessage: string) {
  recentMessages.push({ role: "user", content: userMessage });
  if (recentMessages.length > MAX_RECENT_TURNS) {
    const toArchive = recentMessages.splice(
      0,
      recentMessages.length - MAX_RECENT_TURNS,
    );
    conversationSummary = await summarizeOlderTurns(
      toArchive,
      conversationSummary,
    );

    console.log(68, conversationSummary);
    console.log(` [Summarized ${toArchive.length} older turns]`);
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    SYSTEM_PROMPT,
    ...(conversationSummary
      ? [
          {
            role: "system" as const,
            content: `Conversation context so far:\n${conversationSummary}`,
          },
        ]
      : []),
    ...recentMessages,
  ];

  const response: any = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.3,
    max_tokens: TOKEN_BUDGET.output,
  });
  const reply = response.choices[0].message.content ?? "";
  recentMessages.push({ role: "assistant", content: reply });
  console.log(
    ` [Context: ${response.usage?.prompt_tokens} tokens | Output: ${response.usage?.completion_tokens} tokens]`,
  );
  return reply;
}

async function main() {
    const countries = ["Germany", "Japan", "Brazil", "India", "France", "Nigeria"];
    for (const country of countries) {
        console.log(`\n--- ${country} ---`);
        await chat(`What are the key contractor compliance requirements in ${country}?`);
    }
    console.log("\n--- Recall test ---");
    const recall = await chat("What did we discuss about Germany and Japan specifically?");
    console.log(recall);
  }
main().catch(console.error);