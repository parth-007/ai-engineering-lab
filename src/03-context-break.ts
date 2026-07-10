import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI();

const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: "You are an HR compliance assistant for a global platform.",
  },
];

async function chat(msg: string) {
  history.push({ role: "user", content: msg });
  const response: any = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: history,
    temperature: 0.3,
    max_tokens: 500,
  });

  const reply = response.choices[0].message.content ?? "";
  history.push({ role: "assistant", content: reply });
  console.log(`[Tokens used: ${response.usage?.total_tokens}]`);
  return { reply, tokens: response.usage?.total_tokens ?? 0 };
}

async function main() {
  const countries = [
    "Germany",
    "Japan",
    "Brazil",
    "India",
    "France",
    "Nigeria",
    "Australia",
    "Mexico",
    "South Korea",
    "Canada",
    "Netherlands",
    "Singapore",
    "UK",
    "Spain",
    "Italy",
  ];
  for (const country of countries) {
    const { reply, tokens } = await chat(
      `What are the key contractor compliance requirements in ${country}?`,
    );
    console.log(`${country}: ${tokens} total tokens, ${history.length} messages`);
  }
  // Now ask a question about the FIRST country discussed
  const { reply, tokens } = await chat(
    "Remind me — what did you say about Germany specifically? Be precise.",
  );
  console.log(`\nFinal recall test: ${tokens} tokens`);
  console.log(reply);
}

main().catch(console.error);
