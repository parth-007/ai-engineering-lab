import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();
const client = new OpenAI();

const contractorRecordDB: Record<
  string,
  { name: string; country: string; status: string; taxFormStatus: string }
> = {
  "CTR-001": {
    name: "Hans Muller",
    country: "DE",
    status: "active",
    taxFormStatus: "verified",
  },
  "CTR-002": {
    name: "Yuki Tanaka",
    country: "JP",
    status: "active",
    taxFormStatus: "pending_review",
  },
  "CTR-003": {
    name: "Maria Silva",
    country: "BR",
    status: "offboarded",
    taxFormStatus: "expired",
  },
};

const getContractorInfo = async (contractorId: string) => {
    const contractor = contractorRecordDB[contractorId];
    if (!contractor) {
       return JSON.stringify({
        error: "not_found",
        message: `Contractor with ID ${contractorId} not found`,
       });
    }
   return JSON.stringify(contractor);
};

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_contractor_info",
      description:
        "Look up contractor's curent status and tax form status using thier contractor ID, only use this when the user provides a specific contractor ID (format: CTR-XXX)",
      parameters: {
        type: "object",
        properties: {
          contractor_id: {
            type: "string",
            description: "The contractor ID to look up",
          },
        },
        required: ["contractor_id"],
      },
    },
  },
];

async function main() {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are an HR compliance assistant. Use the available tools to look up contractor information when asked about specific contractors."
        },
        {
            role: "user",
            content: "What is the status of contractor CTR-003?"
        }
    ];

    const response: any = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        temperature: 0
    });

    const choice = response.choices[0];
    if (choice.message.tool_calls) {
        console.log("Model wants to call tools:");
        messages.push(choice.message);
        for (const toolCall of choice.message.tool_calls) {
            console.log(`  - Calling tool: ${toolCall.function.name} with arguments: ${JSON.stringify(toolCall.function.arguments)}`);
            const args = JSON.parse(toolCall.function.arguments);
            const result = await getContractorInfo(args.contractor_id);
            console.log(`  - Tool result: ${result}`);

            console.log(choice.message);
           
            messages.push(
                {
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result,
                }
            );

            const finalResponse: any = await client.chat.completions.create({
                model: "gpt-4o-mini",
                messages,
                temperature: 0
            });

            console.log(finalResponse.choices[0].message.content!);
        }

    } else {
        console.log("Model responded directly: ", choice.message.content!);
    }
}

main().catch(console.error);