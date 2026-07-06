import OpenAI from "openai";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const client = new OpenAI();

const contractorDocumentSchema = z.object({
    contractor_name: z.string(),
    country_code: z.string().length(2),
    document_type: z.enum(["tax_form", "government_id", "proof_of_address", "work_permit"]),
    document_number: z.string(),
    expiry_date: z.string().nullable(), // ISO date string, or null if no expiry
    confidence: z.number().min(0).max(1),
});

type ContractorDocument = z.infer<typeof contractorDocumentSchema>;

async function extractContractorDocument(rawText: string): Promise<ContractorDocument> {
    const response:any = await client.chat.completions.create({
       model: "gpt-4o-mini",
       messages: [
        {
            role: "system",
            content: "Extract structured information from the document text provided. " +
          "Respond ONLY with a JSON object matching this exact shape: " +
          "{contractor_name, country_code (ISO 2-letter), document_type (one of: tax_form, government_id, proof_of_address, work_permit), " +
          "document_number, expiry_date (ISO date or null), confidence (0-1)}. " +
          "No markdown, no explanation, just the JSON object.",
        },
        {
            role: "user",
            content: rawText
        }
       ],
       temperature: 0,
       response_format: {
        type: "json_object",
       }
    });

    const raw = response.choices[0].message.content!;
    const parsed = JSON.parse(raw);
    const validated = contractorDocumentSchema.parse(parsed);
    return validated;
}

// Test it
async function main() {
    const result = await extractContractorDocument(
        "Dokument für Müller, irgendwas mit Steuern, Nummer unklar, " +
  "vielleicht 12345 oder 67890, kein Ablaufdatum erwähnt."
    );
    console.log("Validated result:", JSON.stringify(result, null, 2));
  }
  
main().catch(console.error);