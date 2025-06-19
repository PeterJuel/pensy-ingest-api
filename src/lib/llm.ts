// src/lib/llm.ts
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

// Zod schema for response validation
const LLMSummaryResponseSchema = z.object({
  title: z.string().max(100),
  summary: z.string(), // Removed length restriction for detailed RAG content
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
  urgency_level: z.enum(["low", "medium", "high"]),
  ticket_status: z.enum([
    "closed",
    "open",
    "pending_internal",
    "awaiting_customer",
  ]),
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

const SYSTEM_PROMPT = `You are an expert email conversation analyzer for a Norwegian underfloor heating company. Your task is to extract detailed technical knowledge from email conversations for RAG knowledge base ingestion.

CATEGORIES (choose the most appropriate):
1. "project" - Project quotes, mass calculations, drawings, underfloor heating layouts
2. "pricing" - Product pricing, availability, delivery times, discounts
3. "technical_support" - Installation help, troubleshooting, product questions
4. "administrative" - Orders, invoices, price lists, general admin
5. "warranty" - Claims, defective products, returns, RMA requests
6. "marketing" - Training, courses, webinars, product presentations
7. "internal" - Employee-to-employee communication
8. "not_relevant" - Spam, auto-notifications, irrelevant content

TAGS - Create relevant tags for filtering/search. Focus on specific products, technical terms, and business processes. 
CRITICAL: DO NOT include "Roth", "Nordic", or any company names in tags. Focus on product models and technical terms only.
Example tags: Touchline_SL, installation, urgent, quote_request, has_attachments, mass_calculation, troubleshooting, warranty_claim, delivery_schedule, TIPPUNION, MultiPex

TITLE REQUIREMENTS:
- NEVER include company names like "Roth", "Nordic" etc.
- Focus on the technical content: product names, issue types, or business function
- Examples: "Touchline SL Installation Question", "MultiPex Pipe Pricing Request", "TIPPUNION Technical Support"

RAG KNOWLEDGE EXTRACTION (NOT a summary - extract ALL technical details):
- Extract and preserve ALL specific technical information: exact product names, model numbers, specifications, quantities, dimensions
- Include ALL part numbers, article numbers, product codes mentioned
- Preserve ALL pricing information, measurements, technical specifications
- Include ALL installation details, configuration steps, troubleshooting procedures
- Extract ALL error codes, compatibility information, technical requirements
- Remove personal information: company names, personal names, addresses, phone numbers, email addresses
- Use placeholders: "Customer", "Agent", "Partner company", "Project location"
- Format: "Customer requests [extract exact technical details, quantities, specifications, part numbers]. Agent responds [extract exact technical response, procedures, specifications]. Technical context: [all remaining technical details, measurements, compatibility info]."
- PRESERVE all technical knowledge that would help answer similar future inquiries
- Include exact dimensions, quantities, product specifications, installation requirements
- Extract all technical terminology, part numbers, model variants

CRITICAL: This is KNOWLEDGE EXTRACTION, not summarization. Include ALL technical details, specifications, and product information from the conversation.

URGENCY: "high" (urgent/critical), "medium" (time-sensitive), "low" (general inquiry)

TICKET STATUS: Analyze the conversation to determine current status:
- "closed" - Issue resolved, no further action needed, customer satisfied
- "open" - New inquiry or issue, needs response or action
- "pending_internal" - Waiting for internal action (pricing, technical review, approval)
- "awaiting_customer" - Waiting for customer response (more info, decision, confirmation)

CRITICAL INSTRUCTIONS:
- NEVER use company names in titles or tags
- EXTRACT every technical detail, don't summarize
- Focus on creating comprehensive technical knowledge entries
- This is for internal RAG system training

Respond ONLY with valid JSON. Extract ALL technical details for comprehensive knowledge capture.`;

/**
 * Generate conversation summary using LangChain + OpenAI
 */
export async function generateLLMSummary(
  conversationData: any
): Promise<LLMSummaryResponse> {
  const startTime = Date.now();

  // Initialize ChatOpenAI with LangSmith tracing
  const llm = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL || "o3-mini",
    // Note: o3 models don't support temperature parameter
    ...(process.env.OPENAI_MODEL?.includes("o3") ? {} : { temperature: 0.1 }),
    openAIApiKey: process.env.OPENAI_API_KEY,
    // LangSmith configuration
    tags: ["email-summary", "conversation-analysis"],
    metadata: {
      project: "roht-api-dev",
      component: "email-pipeline",
      step: "summary-generation",
      email_count: conversationData.emails?.length || 0,
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
  const userPrompt = `Analyze this email conversation and provide structured summary information:

CONVERSATION DATA:
${JSON.stringify(request.conversation, null, 2)}

EMAIL COUNT: ${request.conversation.emails.length}
DATE RANGE: ${request.conversation.date_range.earliest} to ${
    request.conversation.date_range.latest
  }

Please provide a JSON response with:
{
  "title": "Clear, descriptive title (max 100 chars)",
  "summary": "Comprehensive summary of the conversation (2-3 sentences)",
  "category": "most_appropriate_category",
  "tags": ["relevant", "tags", "for", "filtering"],
  "confidence": 0.95,
  "key_topics": ["main", "topics", "discussed"],
  "urgency_level": "low|medium|high",
  "ticket_status": "closed|open|pending_internal|awaiting_customer",
  "action_required": true|false,
  "next_steps": ["if", "action", "required"]
}`;

  // Create messages for the conversation
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ];

  // Make the LLM request with LangChain
  const response = await llm.invoke(messages, {
    tags: ["summary-generation"],
    metadata: {
      conversation_id: conversationData.conversation_id,
      email_count: request.conversation.emails.length,
      processing_timestamp: new Date().toISOString(),
    },
  });

  // Parse and validate the response
  let parsedResponse: any;
  try {
    parsedResponse = JSON.parse(response.content as string);
  } catch (parseError) {
    // Try to extract JSON from the response if it's wrapped in text
    const jsonMatch = (response.content as string).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedResponse = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Could not parse JSON from LLM response");
    }
  }

  // Validate the response using Zod schema
  const validatedResponse = LLMSummaryResponseSchema.parse(parsedResponse);

  console.log(
    `LLM summary generated in ${
      Date.now() - startTime
    }ms with LangSmith tracking`
  );

  return validatedResponse;
}
