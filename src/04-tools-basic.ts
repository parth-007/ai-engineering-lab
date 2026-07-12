import OpenAI from "openai";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { z } from "zod";
import "dotenv/config";

const client = new OpenAI();

type ContractorRecord = {
  id: string;
  name: string;
  country: string;
  status: string;
  taxFormStatus: string;
};

const ContractorIdSchema = z
  .string()
  .regex(/^CTR-\d{3}$/, "Contractor ID must match CTR-XXX, for example CTR-001");

const GetContractorInfoArgsSchema = z
  .object({
    contractor_id: ContractorIdSchema,
  })
  .strict();

const ListContractorsArgsSchema = z.object({}).strict();

const CreateContractorArgsSchema = z
  .object({
    id: ContractorIdSchema.optional(),
    name: z.string().min(1, "Name is required"),
    country: z.string().length(2, "Country must be a two-letter country code"),
    status: z.string().min(1, "Status is required"),
    tax_form_status: z.string().min(1, "Tax form status is required"),
  })
  .strict();

const UpdateContractorArgsSchema = z
  .object({
    contractor_id: ContractorIdSchema,
    name: z.string().min(1, "Name cannot be empty").optional(),
    country: z.string().length(2, "Country must be a two-letter country code").optional(),
    status: z.string().min(1, "Status cannot be empty").optional(),
    tax_form_status: z.string().min(1, "Tax form status cannot be empty").optional(),
  })
  .strict()
  .refine(
    ({ name, country, status, tax_form_status }) =>
      [name, country, status, tax_form_status].some((value) => value !== undefined),
    "Provide at least one field to update",
  );

const DeleteContractorArgsSchema = z
  .object({
    contractor_id: ContractorIdSchema,
  })
  .strict();

const validationError = (error: z.ZodError) =>
  JSON.stringify({
    error: "invalid_tool_arguments",
    message: error.issues
      .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
      .join("; "),
  });

const contractorRecordDB: Record<string, ContractorRecord> = {
  "CTR-001": {
    id: "CTR-001",
    name: "Hans Muller",
    country: "DE",
    status: "active",
    taxFormStatus: "verified",
  },
  "CTR-002": {
    id: "CTR-002",
    name: "Yuki Tanaka",
    country: "JP",
    status: "active",
    taxFormStatus: "pending_review",
  },
  "CTR-003": {
    id: "CTR-003",
    name: "Maria Silva",
    country: "BR",
    status: "offboarded",
    taxFormStatus: "expired",
  },
};

const nextContractorId = () => {
  const nextNumber =
    Math.max(
      0,
      ...Object.keys(contractorRecordDB).map((id) => Number(id.replace("CTR-", ""))),
    ) + 1;

  return `CTR-${String(nextNumber).padStart(3, "0")}`;
};

const listContractors = () => JSON.stringify(Object.values(contractorRecordDB));

const getContractorInfo = (contractorId: string) => {
  const contractor = contractorRecordDB[contractorId];
  if (!contractor) {
    return JSON.stringify({
      error: "not_found",
      message: `Contractor with ID ${contractorId} not found`,
    });
  }

  return JSON.stringify(contractor);
};

const createContractor = (contractor: Omit<ContractorRecord, "id"> & { id?: string }) => {
  const id = contractor.id ?? nextContractorId();
  if (contractorRecordDB[id]) {
    return JSON.stringify({
      error: "already_exists",
      message: `Contractor with ID ${id} already exists`,
    });
  }

  contractorRecordDB[id] = { id, ...contractor };
  return JSON.stringify(contractorRecordDB[id]);
};

const updateContractor = (
  contractorId: string,
  updates: Partial<Omit<ContractorRecord, "id">>,
) => {
  const contractor = contractorRecordDB[contractorId];
  if (!contractor) {
    return JSON.stringify({
      error: "not_found",
      message: `Contractor with ID ${contractorId} not found`,
    });
  }

  contractorRecordDB[contractorId] = { ...contractor, ...updates };
  return JSON.stringify(contractorRecordDB[contractorId]);
};

const deleteContractor = (contractorId: string) => {
  const contractor = contractorRecordDB[contractorId];
  if (!contractor) {
    return JSON.stringify({
      error: "not_found",
      message: `Contractor with ID ${contractorId} not found`,
    });
  }

  delete contractorRecordDB[contractorId];
  return JSON.stringify({
    deleted: true,
    contractor,
  });
};

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_contractor_info",
      description:
        "Read one contractor record using its contractor ID. Use when the user asks about a specific contractor.",
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
  {
    type: "function",
    function: {
      name: "list_contractors",
      description: "List all contractor records in the in-memory database.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_contractor",
      description:
        "Create a new contractor record in the in-memory database. If no ID is provided, one will be generated.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Optional contractor ID, format CTR-XXX",
          },
          name: {
            type: "string",
            description: "Contractor full name",
          },
          country: {
            type: "string",
            description: "Two-letter country code, such as DE, JP, BR, or IN",
          },
          status: {
            type: "string",
            description: "Contractor status, such as active, pending, or offboarded",
          },
          tax_form_status: {
            type: "string",
            description: "Tax form status, such as verified, pending_review, or expired",
          },
        },
        required: ["name", "country", "status", "tax_form_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_contractor",
      description:
        "Update fields on an existing contractor record. Only include fields the user wants changed.",
      parameters: {
        type: "object",
        properties: {
          contractor_id: {
            type: "string",
            description: "The contractor ID to update",
          },
          name: {
            type: "string",
            description: "New contractor full name",
          },
          country: {
            type: "string",
            description: "New two-letter country code",
          },
          status: {
            type: "string",
            description: "New contractor status",
          },
          tax_form_status: {
            type: "string",
            description: "New tax form status",
          },
        },
        required: ["contractor_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_contractor",
      description: "Delete a contractor record from the in-memory database.",
      parameters: {
        type: "object",
        properties: {
          contractor_id: {
            type: "string",
            description: "The contractor ID to delete",
          },
        },
        required: ["contractor_id"],
      },
    },
  },
];

const runTool = (name: string, rawArguments: string) => {
  let rawArgs: unknown;
  try {
    rawArgs = JSON.parse(rawArguments || "{}");
  } catch (error) {
    return JSON.stringify({
      error: "invalid_json",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  switch (name) {
    case "get_contractor_info": {
      const result = GetContractorInfoArgsSchema.safeParse(rawArgs);
      if (!result.success) {
        return validationError(result.error);
      }

      const args = result.data;
      return getContractorInfo(args.contractor_id);
    }
    case "list_contractors": {
      const result = ListContractorsArgsSchema.safeParse(rawArgs);
      if (!result.success) {
        return validationError(result.error);
      }

      return listContractors();
    }
    case "create_contractor": {
      const result = CreateContractorArgsSchema.safeParse(rawArgs);
      if (!result.success) {
        return validationError(result.error);
      }

      const args = result.data;
      const contractor: Omit<ContractorRecord, "id"> & { id?: string } = {
        name: args.name,
        country: args.country,
        status: args.status,
        taxFormStatus: args.tax_form_status,
      };
      if (args.id !== undefined) {
        contractor.id = args.id;
      }

      return createContractor(contractor);
    }
    case "update_contractor": {
      const result = UpdateContractorArgsSchema.safeParse(rawArgs);
      if (!result.success) {
        return validationError(result.error);
      }

      const args = result.data;
      const updates: Partial<Omit<ContractorRecord, "id">> = {};
      if (args.name !== undefined) {
        updates.name = args.name;
      }
      if (args.country !== undefined) {
        updates.country = args.country;
      }
      if (args.status !== undefined) {
        updates.status = args.status;
      }
      if (args.tax_form_status !== undefined) {
        updates.taxFormStatus = args.tax_form_status;
      }

      return updateContractor(args.contractor_id, updates);
    }
    case "delete_contractor": {
      const result = DeleteContractorArgsSchema.safeParse(rawArgs);
      if (!result.success) {
        return validationError(result.error);
      }

      const args = result.data;
      return deleteContractor(args.contractor_id);
    }
    default:
      return JSON.stringify({
        error: "unknown_tool",
        message: `No local implementation found for tool ${name}`,
      });
  }
};

async function chat(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
    console.log("Messages:", messages);
  while (true) {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      temperature: 0,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return "No response from model.";
    }

    messages.push(message);

    if (!message.tool_calls?.length) {
      return message.content ?? "";
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: "unsupported_tool_call",
            message: `Unsupported tool call type: ${toolCall.type}`,
          }),
        });
        continue;
      }

      const result = runTool(toolCall.function.name, toolCall.function.arguments);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }
}

async function main() {
  const rl = createInterface({ input, output });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are an HR compliance assistant. Use tools for all contractor CRUD operations. " +
        "Ask a short follow-up question when the user wants to create or update a record but did not provide enough fields. " +
        "Keep responses concise and mention contractor IDs when records are created, updated, read, or deleted.",
    },
  ];

  console.log("Contractor CRUD assistant. Try: list contractors, create a contractor, update CTR-002, delete CTR-003.");
  console.log("Type exit to quit.\n");

  try {
    while (true) {
      const userInput = await rl.question("You: ");
      if (["exit", "quit"].includes(userInput.trim().toLowerCase())) {
        break;
      }

      messages.push({ role: "user", content: userInput });
      const reply = await chat(messages);
      console.log(`Assistant: ${reply}\n`);
    }
  } finally {
    rl.close();
  }
}

main().catch(console.error);