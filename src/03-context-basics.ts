import OpenAI from "openai";
import "dotenv/config";
const client = new OpenAI();

// A simple conversation loop that accumulates history
const conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content:
      "You are an HR compliance assistant for a global platform. " +
      "You help internal teams understand contractor requirements by country.",
  },
];

async function chat(userMessage: string): Promise<string> {
  conversationHistory.push({ role: "user", content: userMessage });
  const response: any = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: conversationHistory,
    temperature: 0.3,
    max_tokens: 500,
  });
  const reply = response.choices[0].message.content ?? "";
  conversationHistory.push({ role: "assistant", content: reply });
  console.log(`[Tokens used: ${response.usage?.total_tokens}]`);
  return reply;
}

async function main() {
    console.log(await chat("What tax forms does a US contractor need?"));
    console.log(`Total messages in context: ${conversationHistory.length}`);
    console.log("---");
    console.log(await chat("What about Germany?"));
    console.log(`Total messages in context: ${conversationHistory.length}`);
    console.log("---");
    console.log(await chat("Compare the two countries' requirements."));
    console.log(`Total messages in context: ${conversationHistory.length}`);
    console.log("---");
    console.log(await chat("What about France?"));
    console.log(`Total Final messages in context: ${conversationHistory.length}`);
    console.log("---");
}
main().catch(console.error);