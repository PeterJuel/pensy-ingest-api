// src/lib/llm.ts
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { randomUUID } from "crypto";
import logger from "./logger";

// Zod schema for response validation
const LLMSummaryResponseSchema = z.object({
  title: z.string().max(100),
  knowledge_content: z.string(),
  category: z.enum([
    "project",
    "pricing",
    "technical_support",
    "administrative",
    "warranty",
    "marketing",
    "internal",
    "not_relevant",
  ]),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  key_topics: z.array(z.string()),
  urgency_level: z.enum(["low", "medium", "high"]), // Tilbage til engelsk
  ticket_status: z.enum([
    "closed",
    "open",
    "pending_internal",
    "awaiting_customer",
  ]), // Tilbage til engelsk
  action_required: z.boolean(),
  next_steps: z.array(z.string()).optional(),
});

interface LLMSummaryRequest {
  conversation: {
    emails: Array<{
      subject: string | null;
      content: string;
      received_at: string;
      attachments: string[];
    }>;
    date_range: {
      earliest: string;
      latest: string;
    };
  };
}

type LLMSummaryResponse = z.infer<typeof LLMSummaryResponseSchema>;

const SYSTEM_PROMPT = `Du er en ekspert email-samtale analysator for et gulvvarme firma. Din opgave er at udtrække detaljeret teknisk viden fra email-samtaler til RAG knowledge base.

KATEGORIER (vælg den mest passende - vær specifik):
1. "project" - KUN projekttilbud, masseberegninger, nye installationstegninger og komplette systemdesign
2. "pricing" - Prisforespørgsler, tilbud, rabatter, leveringstider, produktpriser
3. "technical_support" - Installations hjælp, fejlfinding, reparationer, produkt spørgsmål, hvordan-gør-jeg
4. "administrative" - Ordrebekræftelser, fakturaer, prislister, leveringsstatus, generel administration  
5. "warranty" - Reklamationer, defekte produkter, returvarer, RMA anmodninger
6. "marketing" - Kurser, webinarer, produkt præsentationer, kataloger
7. "internal" - Medarbejder-til-medarbejder kommunikation
8. "not_relevant" - Spam, auto-notifikationer, irrelevant indhold

KATEGORISERINGS GUIDE:
- Hvis kunden beder om PRIS/TILBUD på eksisterende system → "pricing"
- Hvis kunden beder om DESIGN/TEGNINGER til nyt projekt → "project" 
- Hvis kunden har et PROBLEM med eksisterende installation → "technical_support"
- Hvis det handler om BESTILLING/LEVERING/FAKTURA → "administrative"

TAGS - Opret relevante tags til filtrering/søgning. Fokuser på specifikke produkter, tekniske termer og forretningsprocesser.
KRITISK: Inkluder IKKE firma navne i tags. Fokuser kun på produkt modeller og tekniske termer.
Eksempel tags: Touchline_SL, installation, hastesag, pris_forespørgsel, har_vedhæftninger, masse_beregning, fejlfinding, garanti_sag, leveringsplan, TIPPUNION, MultiPex

TITEL KRAV:
- Inkluder ALDRIG firmanavne
- Fokuser på det tekniske indhold: produktnavne, problemtyper eller forretningsfunktion
- Eksempler: "Touchline SL Installations Spørgsmål", "MultiPex Rør Pris Forespørgsel", "TIPPUNION Teknisk Support"

VIDEN UDTRÆKNING (IKKE sammendrag - udtræk ALLE tekniske detaljer):
- Udtræk og bevar ALLE specifikke tekniske informationer: nøjagtige produktnavne, model numre, specifikationer, mængder, dimensioner
- Inkluder ALLE del numre, artikel numre, produkt koder nævnt
- Bevar ALLE pris informationer, målinger, tekniske specifikationer
- Inkluder ALLE installations detaljer, konfigurationstrin, fejlfindingsprocedurer
- Udtræk ALLE fejlkoder, kompatibilitetsinformation, tekniske krav
- KRITISK: Fjern ALLE firmanavne fra indholdet - brug kun "Kunde", "Agent", "Partner firma", "Installations firma"
- Fjern personlige informationer: ALLE firmanavne, personnavne, adresser, telefonnumre, email adresser
- Brug pladsholdere: "Kunde", "Agent", "Partner firma", "Projekt lokation", "Installations firma"
- Format: "Kunde anmoder om [udtræk nøjagtige tekniske detaljer, mængder, specifikationer, del numre]. Agent svarer [udtræk nøjagtig teknisk respons, procedurer, specifikationer]. Teknisk kontekst: [alle resterende tekniske detaljer, målinger, kompatibilitets info]."
- BEVAR al teknisk viden der ville hjælpe med at besvare lignende fremtidige forespørgsler
- Inkluder nøjagtige dimensioner, mængder, produkt specifikationer, installations krav
- Udtræk al teknisk terminologi, del numre, model varianter
- ALDRIG inkluder specifikke firmanavne som "OWESEN A/S", "Brødrene Dahl" osv.

KRITISK: Dette er VIDEN UDTRÆKNING, ikke sammendrag. Inkluder ALLE tekniske detaljer, specifikationer og produkt information fra samtalen.

HASTIGHED: "high" (hastende/kritisk), "medium" (tidsfølsom), "low" (generel forespørgsel)

SAGS STATUS: Analyser samtalen for at bestemme nuværende status:
- "closed" - Problem løst, ingen yderligere handling nødvendig, kunde tilfreds
- "open" - Ny forespørgsel eller problem, kræver respons eller handling
- "pending_internal" - Venter på intern handling (prissætning, teknisk gennemgang, godkendelse)
- "awaiting_customer" - Venter på kunde respons (mere info, beslutning, bekræftelse)

KRITISKE INSTRUKTIONER:
- Brug ALDRIG firmanavne i titler eller tags
- UDTRÆK alle tekniske detaljer, lav ikke sammendrag
- Fokuser på at skabe omfattende tekniske vidensindgange
- Dette er til internt RAG system træning
- Svar på dansk med danske tekniske termer
- VIGTIGT: Fjern ALLE firmanavne fra knowledge_content - brug kun generiske betegnelser som "Kunde", "Installations firma", "Partner firma"

Svar KUN med gyldig JSON på dansk. Udtræk ALLE tekniske detaljer for omfattende viden capture.`;

/**
 * Generate conversation summary using LangChain + OpenAI
 */
export async function generateLLMSummary(
  conversationData: any
): Promise<LLMSummaryResponse & { traceInfo?: any }> {
  const startTime = Date.now();
  let traceInfo: any = null;

  // Validate required environment variables
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  if (!process.env.LANGCHAIN_API_KEY) {
    throw new Error("LANGCHAIN_API_KEY environment variable is required");
  }
  if (!process.env.LANGCHAIN_PROJECT) {
    throw new Error("LANGCHAIN_PROJECT environment variable is required");
  }
  if (!process.env.LANGCHAIN_PROJECT_ID) {
    throw new Error("LANGCHAIN_PROJECT_ID environment variable is required");
  }
  if (!process.env.LANGCHAIN_ORG_ID) {
    throw new Error("LANGCHAIN_ORG_ID environment variable is required");
  }

  // Initialize ChatOpenAI with LangSmith tracing
  const llm = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL || "o3-mini",
    // Note: o3 models don't support temperature parameter
    ...(process.env.OPENAI_MODEL?.includes("o3") ? {} : { temperature: 0.1 }),
    openAIApiKey: process.env.OPENAI_API_KEY,
    // LangSmith configuration
    tags: ["email-summary", "conversation-analysis"],
    metadata: {
      project: process.env.LANGCHAIN_PROJECT,
      component: "email-pipeline",
      step: "summary-generation",
      email_count: conversationData.emails?.length || 0,
      conversation_id: conversationData.conversation_id,
    },
  });

  // Prepare the conversation data for the LLM
  const request: LLMSummaryRequest = {
    conversation: {
      emails: conversationData.emails.map((email: any) => ({
        subject: email.subject,
        content: email.plain_text_content || "",
        received_at: email.received_at,
        attachments: email.attachments || [],
      })),
      date_range: conversationData.date_range,
    },
  };

  // Create the user prompt
  const userPrompt = `Udtræk omfattende teknisk viden fra denne email samtale til RAG vidensbase:

SAMTALE DATA:
${JSON.stringify(request.conversation, null, 2)}

EMAIL ANTAL: ${request.conversation.emails.length}
DATO INTERVAL: ${request.conversation.date_range.earliest} til ${
    request.conversation.date_range.latest
  }

KRITISK: Dette er DETALJERET VIDEN UDTRÆKNING til RAG system træning. Udtræk ALLE tekniske detaljer, specifikationer, del numre, kompatibilitetsinformation, forretningsprocesser og løsninger.

Giv et JSON svar med:
{
  "title": "Kort teknisk titel fokuseret på hovedemne (INGEN tekniske detaljer, INGEN firmanavne)",
  "knowledge_content": "OMFATTENDE teknisk dokumentation til RAG træning. Udtræk ALLE specifikationer, del numre, teknisk rådgivning, kompatibilitetsinformation, forretningsprocesser, prisdetaljer og trin-for-trin procedurer. KRITISK: Fjern ALLE firmanavne og brug kun 'Kunde', 'Agent', 'Installations firma', 'Partner firma'. Inkluder hver teknisk detalje der ville hjælpe med at besvare fremtidige tekniske spørgsmål om lignende scenarier.",
  "category": "mest_passende_kategori",
  "tags": ["generelle", "produkt", "kategori", "tags"],
  "confidence": 0.95,
  "key_topics": ["hoved", "emner"],
  "urgency_level": "low|medium|high",
  "ticket_status": "closed|open|pending_internal|awaiting_customer",
  "action_required": true|false,
  "next_steps": ["hvis", "handling", "kræves"]
}

FELT RETNINGSLINJER:
- TITEL: Kort, generelt emne kun (f.eks., "VORTEX Pumpe Komponenter", "Termostat Installation")
- KNOWLEDGE_CONTENT: Udtræk ALT teknisk indhold - dette er omfattende teknisk dokumentation. Inkluder:
  * Nøjagtige produktnavne, model numre, del numre, specifikationer
  * Al teknisk rådgivning, kompatibilitetsinformation, installations detaljer
  * Alle forretningsprocesser, prisdiskussioner, leveringsarrangementer
  * Alle problem-løsning par, overvejede alternativer
  * Alle målinger, mængder, tekniske forhold
  * Alle kundekrav, specielle instruktioner
- TAGS: Generelle kategorier kun (f.eks., "VORTEX", "pumpe_komponenter", "teknisk_support")
- KEY_TOPICS: Højniveau emner kun

EKSEMPLER PÅ DETALJERET UDTRÆKNING:
I stedet for: "Kunde bestiller pumpe komponenter"
Udtræk: "Kunde bestiller VORTEX pumpe komponenter: 1x VORTEX overdel 155 inkl. løpehjul og pakning (del #12345), 1x VORTEX BWO-OT med ½" muffe (del #67890). Agent forklarer teknisk kompatibilitet: ved udskiftning af motor/overdel på eksisterende 155 motor skal løpehjul også skiftes for at passe til gamle 150 pumpehus. Alternativ løsning: 152-154 løpehjul kompatibel med eksisterende overdel/motor/pumpehus kombination."

HUSk: Dette er træningsdata til et RAG system. Udtræk ALLE tekniske detaljer, specifikationer, processer og råd der ville hjælpe med at besvare fremtidige lignende spørgsmål.`;

  // Create messages for the conversation
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ];

  // Make the LLM request with LangChain and capture trace info
  const runId = randomUUID();
  const response = await llm.invoke(messages, {
    runId: runId,
    tags: ["summary-generation"],
    metadata: {
      conversation_id: conversationData.conversation_id,
      email_count: request.conversation.emails.length,
      processing_timestamp: new Date().toISOString(),
    },
    callbacks: [
      {
        handleLLMStart: async (llm, prompts, runId) => {
          traceInfo = {
            run_id: runId,
            start_time: new Date().toISOString(),
            model_name: process.env.OPENAI_MODEL || "o3-mini",
            langsmith_project: process.env.LANGCHAIN_PROJECT,
          };
        },
        handleLLMEnd: async (output, runId) => {
          if (traceInfo) {
            traceInfo.end_time = new Date().toISOString();
            traceInfo.token_usage = output.llmOutput?.tokenUsage;
          }
        },
      },
    ],
  });

  // Parse and validate the response
  let parsedResponse: any;
  try {
    parsedResponse = JSON.parse(response.content as string);
  } catch (parseError) {
    logger.debug("Raw LLM response for JSON parsing failure", "LLM", { 
      responseContent: response.content 
    });

    // Helper function to get error message safely
    const getErrorMessage = (error: unknown): string => {
      if (error instanceof Error) {
        return error.message;
      }
      return String(error);
    };

    // Clean the response text before trying to parse
    let cleanedContent = response.content as string;

    // Remove markdown code blocks if present
    cleanedContent = cleanedContent.replace(/```json\s*|\s*```/g, "");

    // Try to extract JSON from the response if it's wrapped in text
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // Clean control characters from the JSON
        const cleanedJson = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
          .replace(/\n/g, "\\n") // Escape newlines
          .replace(/\r/g, "\\r") // Escape carriage returns
          .replace(/\t/g, "\\t"); // Escape tabs

        parsedResponse = JSON.parse(cleanedJson);
      } catch (secondParseError) {
        logger.error("Failed to parse cleaned JSON", "LLM", { 
          error: secondParseError instanceof Error ? secondParseError.message : String(secondParseError)
        });
        throw new Error(
          `Could not parse JSON from LLM response. Original error: ${getErrorMessage(
            parseError
          )}`
        );
      }
    } else {
      throw new Error(
        `Could not find JSON in LLM response. Parse error: ${getErrorMessage(
          parseError
        )}`
      );
    }
  }

  // Validate the response using Zod schema
  const validatedResponse = LLMSummaryResponseSchema.parse(parsedResponse);

  // Generate LangSmith trace URL if we have trace info
  let langsmithUrl = null;
  if (traceInfo) {
    langsmithUrl = `https://smith.langchain.com/o/${process.env.LANGCHAIN_ORG_ID}/projects/p/${process.env.LANGCHAIN_PROJECT_ID}/r/${traceInfo.run_id}`;
  }

  logger.info("LLM summary generated", "LLM", {
    duration: `${Date.now() - startTime}ms`,
    langsmithTrace: langsmithUrl
  });

  return {
    ...validatedResponse,
    traceInfo: traceInfo ? {
      ...traceInfo,
      langsmith_url: langsmithUrl,
      processing_duration_ms: Date.now() - startTime,
    } : undefined,
  };
}
