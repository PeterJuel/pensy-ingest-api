// src/pipeline/steps/summary.ts
import { query } from "../../lib/db";
import { Email } from "../types";

interface SummaryResult {
  title: string;
  summary: string; // We'll map knowledge_content to summary for DB compatibility
  category: string;
  tags: string[];
  // Additional LLM fields
  confidence: number;
  key_topics: string[];
  urgency_level: string;
  ticket_status: string;
  action_required: boolean;
  next_steps?: string[];
}

/**
 * Pipeline step: Generate conversation summary, title, tags, and category
 *
 * This step processes a conversation's aggregated content and generates:
 * - A descriptive title
 * - A summary of the conversation
 * - A category classification
 * - Relevant tags
 */
export async function summary(email: Email): Promise<void> {
  const startTime = Date.now();

  try {
    // Get the conversation ID from the current email
    const conversationId = email.conversation_id;

    if (!conversationId) {
      console.warn(
        `[summary] Email ${email.id} has no conversation_id, skipping`
      );
      return;
    }

    console.log(
      `[summary] Processing summary for conversation ${conversationId} triggered by email ${email.id}`
    );

    // Get the conversation content
    const [conversationData] = await query<{
      content: any;
      metadata: any;
    }>(
      `
      SELECT content, metadata
      FROM conversation_outputs
      WHERE conversation_id = $1
      `,
      [conversationId]
    );

    if (!conversationData) {
      console.warn(
        `[summary] No conversation data found for conversation ${conversationId}`
      );
      return;
    }

    // Extract the conversation content
    const conversation = conversationData.content;
    if (
      !conversation ||
      !conversation.emails ||
      conversation.emails.length === 0
    ) {
      console.warn(
        `[summary] No emails found in conversation ${conversationId}`
      );
      return;
    }

    // Generate summary (for now, a simple implementation)
    // TODO: Replace with actual LLM call when ready
    const summaryResult = await generateSummary(conversation);

    // Update the conversation_outputs table with summary data
    await query(
      `
      UPDATE conversation_outputs
      SET 
        title = $2,
        summary = $3,
        category = $4,
        tags = $5,
        summary_metadata = $6,
        updated_at = now()
      WHERE conversation_id = $1
      `,
      [
        conversationId,
        summaryResult.title,
        summaryResult.summary,
        summaryResult.category,
        summaryResult.tags,
        {
          processing_time_ms: Date.now() - startTime,
          email_count: conversation.emails.length,
          generated_at: new Date().toISOString(),
          triggered_by_email: email.id,
          method: "llm",
          // Store additional LLM fields
          confidence: summaryResult.confidence,
          key_topics: summaryResult.key_topics,
          urgency_level: summaryResult.urgency_level,
          ticket_status: summaryResult.ticket_status,
          action_required: summaryResult.action_required,
          next_steps: summaryResult.next_steps || [],
        },
      ]
    );

    console.log(
      `[summary] Completed summary for conversation ${conversationId}: "${summaryResult.title}" (${summaryResult.category})`
    );
  } catch (error) {
    console.error(`[summary] Failed for email ${email.id}:`, error);
    throw error;
  }
}

/**
 * Generate summary using LLM only - no fallback
 */
async function generateSummary(conversation: any): Promise<SummaryResult> {
  const { generateLLMSummary } = await import("../../lib/llm");
  const llmResult = await generateLLMSummary(conversation);

  return {
    title: llmResult.title,
    summary: llmResult.knowledge_content, // Map knowledge_content to summary for DB compatibility
    category: llmResult.category,
    tags: llmResult.tags,
    // Include additional LLM fields
    confidence: llmResult.confidence,
    key_topics: llmResult.key_topics,
    urgency_level: llmResult.urgency_level,
    ticket_status: llmResult.ticket_status,
    action_required: llmResult.action_required,
    next_steps: llmResult.next_steps,
  };
}
