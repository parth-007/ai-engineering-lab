import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI();

async function main() {
    const start = Date.now();

    const response:any = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant for a global HR platform." },
          { role: "user", content: "What documents does a contractor in Germany typically need to provide for tax compliance?" },
        ],
        temperature: 0.2,
        max_tokens: 500,
      });

      const elapsed = Date.now() - start;
      const message = response.choices[0].message.content;
      const usage = response.usage;

      console.log("=== Response ===");
      console.log(message);
      console.log("\n=== Metadata ===");
      console.log(`Latency: ${elapsed}ms`);
      console.log(`Input tokens: ${usage?.prompt_tokens}`);
      console.log(`Output tokens: ${usage?.completion_tokens}`);
      console.log(`Total tokens: ${usage?.total_tokens}`);
}

main();