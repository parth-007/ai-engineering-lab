import OpenAI from "openai";
import pg from "pg";
import "dotenv/config";

const client = new OpenAI();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required in your .env file");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost")
    ? false
    : {
        rejectUnauthorized: false,
      },
});

const SAMPLE_DOCS = [
  {
    title: "Germany Contractor Tax Requirements",
    content:
      "Contractors operating in Germany must provide a valid Steuerliche Identifikationsnummer (tax ID). For non-resident contractors, a limited tax liability certificate (Freistellungsbescheinigung) may be required. All contractors must submit invoices that comply with German VAT (Umsatzsteuer) regulations, including a valid VAT identification number if applicable. Tax forms must be submitted annually by May 31st of the following year.",
    source: "compliance-wiki/germany-tax",
    lastUpdated: "2025-11-15",
  },
  {
    title: "Japan Contractor Compliance",
    content: `Foreign contractors in Japan must obtain a valid work visa or
    business manager visa. Income earned in Japan is subject to a 20.42%
    withholding tax for non-residents. Contractors must register with the
    local tax office and submit a final tax return (kakutei shinkoku)
    between February 16 and March 15 annually. A My Number (individual
    number) is required for all tax-related procedures.`,
    source: "compliance-wiki/japan-tax",
    lastUpdated: "2025-09-20",
  },
  {
    title: "Brazil Contractor Requirements",
    content: `Contractors in Brazil must register as a Microempreendedor
    Individual (MEI) or establish a legal entity. They need a CPF (Cadastro
    de Pessoas Fisicas) for tax purposes. The INSS social security
    contribution is mandatory. Invoices must be issued through the Nota
    Fiscal system. Monthly tax obligations include ISS (service tax) and
    income tax withholding at progressive rates from 7.5% to 27.5%.`,
    source: "compliance-wiki/brazil-tax",
    lastUpdated: "2026-01-10",
  },
];

function chunkDocument(
  content: string,
  maxChunkLength: number = 300,
): string[] {
  const sentences = content.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (
      (current + " " + sentence).length > maxChunkLength &&
      current.length > 0
    ) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function createEmbeddings(text: string): Promise<number[] | undefined> {
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0]?.embedding;
}

async function ingestDocuments() {
  for (const doc of SAMPLE_DOCS) {
    const docResult = await pool.query(
      `INSERT INTO documents (title, content, source, last_updated) VALUES ($1, $2, $3, $4) RETURNING id`,
      [doc.title, doc.content, doc.source, doc.lastUpdated],
    );
    const docId = docResult.rows[0].id;
    const chunks = chunkDocument(doc.content, 300);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }

      const embedding = await createEmbeddings(chunk);
      await pool.query(
        `INSERT INTO document_chunks(document_id, chunk_text, chunk_index, embedding, metadata) VALUES ($1, $2, $3, $4, $5)`,
        [
          docId,
          chunk,
          i,
          JSON.stringify(embedding),
          JSON.stringify({
            source: doc.source,
            lastUpdated: doc.lastUpdated,
            title: doc.title,
          }),
        ],
      );

      console.log(
        `Ingested chunk ${i + 1} of ${chunks.length} for document ${doc.title}`,
      );
    }

    console.log(
      `Ingested document: ${doc.title} (ID: ${docResult.rows[0].id})`,
    );
  }
}

async function answerWithRAG(query: string): Promise<string> {
  const chunks = await retrieve(query);
  console.log("\nRetrieved chunks:");
  chunks.forEach((c, i) =>
    console.log(
      ` [${i + 1}] (sim: ${c.similarity.toFixed(3)}) ${c.chunk_text.slice(0, 80)}...`,
    ),
  );
  if (chunks.length === 0) {
    return "No chunks found for the query";
  }
  const context = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.metadata.title}, updated ${c.metadata.lastUpdated}]\n${c.chunk_text}`,
    )
    .join("\n\n");
  const response: any = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Answer the question using ONLY the provided source documents. Cite your sources using [Source N] notation. If the sources do not contain enough information to answer, say so explicitly.",
      },
      { role: "user", content: `Sources:\n${context}\n\nQuestion: ${query}` },
    ],
    temperature: 0,
  });
  return response.choices[0].message.content ?? "No answer found";
}

async function retrieve(query: string, topK = 3) {
  const queryEmbedding = await createEmbeddings(query);
  const result = await pool.query(
    `SELECT chunk_text, metadata, 1 - (embedding <=> $1::vector) AS
        similarity
        FROM document_chunks
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
    [JSON.stringify(queryEmbedding), topK],
  );
  return result.rows;
}

async function main() {
  try {
    // await ingestDocuments();
    // console.log("\n=== Query 1 ===");
    // console.log(
    //   await answerWithRAG("What tax ID does a German contractor need?"),
    // );
    // console.log("\n=== Query 2 ===");
    // console.log(
    //   await answerWithRAG(
    //     "What's the withholding tax rate for contractors in Japan?",
    //   ),
    // );
    // console.log("\n=== Query 3 ===");
    // console.log(
    //   await answerWithRAG("What is the CPF number requirement?"),
    // );
    console.log("\n=== Query 4 ===");
    console.log(
      await answerWithRAGHybrid("What is form ISS-2026B?"),
    );
    console.log("\n=== Query 5 ===");
    console.log(
      await answerWithRAGHybrid(
        "What are the requirements for contractors in Nigeria?",
      ),
    );

    console.log("\n=== Query 4 ===");
    console.log(
      await answerWithRAG("What is form ISS-2026B?"),
    );
  } finally {
    await pool.end();
  }
}

async function answerWithRAGHybrid(question: string): Promise<string> {
  const chunks = await hybridRetrieve(question);
  // If nothing passes the relevance threshold, DECLINE rather than guess
  if (chunks.length === 0) {
    return "I don't have enough information in the available compliance documents to answer this question. Please contact the compliance team directly for guidance.";
  }
  const context = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.metadata.title}, updated ${c.metadata.lastUpdated}]\n${c.chunk_text}`,
    )
    .join("\n\n");
  const response: any = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Answer the question using ONLY the provided source documents. Cite your sources using [Source N] notation. If the sources do not contain enough information to answer confidently, say so explicitly — do not guess or use general knowledge.",
      },
      {
        role: "user",
        content: `Sources:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0,
  });
  return response.choices[0].message.content ?? "No answer found";
}

async function hybridRetrieve(
  query: string,
  topK = 5,
  similarityThreshold = 0.35,
): Promise<
  Array<{ chunk_text: string; combined_score: number; metadata: any }>
> {
  const queryEmbedding = await createEmbeddings(query);
  // Sanitize query for full-text search
  const tsquery = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .join(" & ");
  const result = await pool.query(
    `WITH vector_results AS (
        SELECT id, chunk_text, metadata,
        1 - (embedding <=> $1::vector) AS vector_score
        FROM document_chunks
        ORDER BY embedding <=> $1::vector LIMIT 20
        ),
        keyword_results AS (
        SELECT id, chunk_text, metadata,
        ts_rank(search_vector, to_tsquery('english', $2)) AS
        keyword_score
        FROM document_chunks
        WHERE search_vector @@ to_tsquery('english', $2)
        LIMIT 20
        )
        SELECT COALESCE(v.chunk_text, k.chunk_text) AS chunk_text,
        COALESCE(v.metadata, k.metadata) AS metadata,
        COALESCE(v.vector_score, 0) * 0.6 + COALESCE(k.keyword_score, 0)
         * 0.4 AS combined_score
        FROM vector_results v
        FULL OUTER JOIN keyword_results k ON v.id = k.id
ORDER BY combined_score DESC
LIMIT $3`,
    [JSON.stringify(queryEmbedding), tsquery || "unused", topK],
  );
  // CRITICAL: filter out results below the relevance threshold
  // This is what prevents the "return the least-bad match for a question
  // we genuinely can't answer" failure mode from Step 5.3
  return result.rows.filter((r) => r.combined_score >= similarityThreshold);
}
main().catch(console.error);
