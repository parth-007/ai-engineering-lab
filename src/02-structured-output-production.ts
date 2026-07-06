import OpenAI from "openai";
import { z, ZodError } from "zod";
import "dotenv/config";

const client = new OpenAI();

const ContractorDocumentSchema = z.object({
  contractor_name: z.string(),
  country_code: z.string().length(2),
  document_type: z.enum(["tax_form", "government_id", "proof_of_address", "work_permit"]),
  document_number: z.string(),
  expiry_date: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

type ContractorDocument = z.infer<typeof ContractorDocumentSchema>;

// The production-grade version: validate, retry with specific feedback, then fail clearly
async function extractDocumentInfo(
  rawText: string,
  maxAttempts = 2,
): Promise<{ success: true; data: ContractorDocument } | { success: false; error: string }> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "Extract structured information from the document text provided. " +
        "Respond ONLY with a JSON object matching this exact shape: " +
        "{contractor_name, country_code (ISO 2-letter), document_type (one of: tax_form, " +
        "government_id, proof_of_address, work_permit), document_number, " +
        "expiry_date (ISO date or null), confidence (0-1)}. " +
        "If any field cannot be determined from the input, set confidence below 0.5 " +
        "and use your best guess with the field value reflecting uncertainty.",
    },
    { role: "user", content: rawText },
  ];

  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && lastError) {
      // KEY INSIGHT: the retry includes SPECIFIC error feedback, not a generic "try again"
      messages.push(
        { role: "assistant", content: lastRawOutput! },
        {
          role: "user",
          content: `Your previous response failed validation: ${lastError}. ` +
            `Please correct the specific issue and respond with the full, valid JSON object.`,
        },
      );
    }

    console.log(53, messages);
    const response:any = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    var lastRawOutput = response.choices[0].message.content!;

    try {
      const parsed = JSON.parse(lastRawOutput);
      const validated = ContractorDocumentSchema.parse(parsed);
      return { success: true, data: validated };
    } catch (e) {
      if (e instanceof ZodError) {
        lastError = e.issues.map((err) => `${err.path.join(".")}: ${err.message}`).join("; ");
      } else if (e instanceof SyntaxError) {
        lastError = `Invalid JSON: ${e.message}`;
      } else {
        lastError = String(e);
      }
      console.log(`Attempt ${attempt + 1} failed: ${lastError}`);
    }
  }

  // CRITICAL: don't silently return a default or partial result.
  // Fail explicitly so the caller knows extraction didn't succeed.
  return { success: false, error: `Extraction failed after ${maxAttempts} attempts: ${lastError}` };
}

async function main() {
  // Test with the ambiguous input
  const result = await extractDocumentInfo(
    "n",
  );

  if (result.success) {
    console.log("Extracted:", JSON.stringify(result.data, null, 2));
    if (result.data.confidence < 0.5) {
      console.log("WARNING: Low confidence — flag for human review");
    }
  } else {
    console.log("FAILED:", result.error);
    console.log("ACTION: Route to human review queue");
  }
}

main().catch(console.error);