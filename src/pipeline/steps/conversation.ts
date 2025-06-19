// src/pipeline/steps/conversation.ts
import { query } from "../../lib/db";
import { Email } from "../types";

interface ConversationEmail {
  id: string;
  subject: string | null;
  received_at: string;
  plain_text_content: string;
  attachments: string[];
}

interface ConversationContent {
  conversation_id: string;
  emails: ConversationEmail[];
  email_count: number;
  date_range: {
    earliest: string;
    latest: string;
  };
  subjects: string[];
}

/**
 * Pipeline step: Aggregate all emails in a conversation into a single conversation output
 *
 * This step finds all emails with the same conversation_id and combines their
 * plain text content into a chronological conversation thread.
 */
export async function conversation(email: Email): Promise<void> {
  const startTime = Date.now();

  try {
    // Get the conversation ID from the current email
    const conversationId = email.conversation_id;

    if (!conversationId) {
      console.warn(
        `[conversation] Email ${email.id} has no conversation_id, skipping`
      );
      return;
    }

    console.log(
      `[conversation] Processing conversation ${conversationId} triggered by email ${email.id}`
    );

    // Get all emails in this conversation with their plain text content
    const conversationEmails = await query<{
      id: string;
      subject: string | null;
      received_at: string;
      content: any;
    }>(
      `
      SELECT 
        e.id,
        e.subject,
        e.received_at,
        eo.content
      FROM emails e
      LEFT JOIN email_outputs eo ON e.id = eo.email_id 
        AND eo.output_type = 'plain_text' 
        AND eo.pipeline_version = 'v1'
      WHERE e.conversation_id = $1
      ORDER BY e.received_at ASC
      `,
      [conversationId]
    );

    if (conversationEmails.length === 0) {
      console.warn(
        `[conversation] No emails found for conversation ${conversationId}`
      );
      return;
    }

    // Extract unique subjects
    const subjects = [
      ...new Set(
        conversationEmails
          .map((email) => email.subject)
          .filter(
            (subject): subject is string =>
              subject !== null && subject !== undefined
          )
      ),
    ];

    // Build conversation emails with extracted content
    const emails: ConversationEmail[] = conversationEmails.map((email) => ({
      id: email.id,
      subject: email.subject,
      received_at: email.received_at,
      plain_text_content: email.content?.text || "",
      attachments: email.content?.attachments || [],
    }));

    // Calculate date range
    const sortedDates = conversationEmails.map((e) => e.received_at).sort();
    const dateRange = {
      earliest: sortedDates[0],
      latest: sortedDates[sortedDates.length - 1],
    };

    // Create the conversation content object
    const conversationContent: ConversationContent = {
      conversation_id: conversationId,
      emails,
      email_count: emails.length,
      date_range: dateRange,
      subjects,
    };

    // Calculate metadata
    const totalTextLength = emails.reduce(
      (sum, email) => sum + email.plain_text_content.length,
      0
    );
    const totalAttachments = emails.reduce(
      (sum, email) => sum + email.attachments.length,
      0
    );

    const metadata = {
      email_count: emails.length,
      total_text_length: totalTextLength,
      total_attachments: totalAttachments,
      processing_time_ms: Date.now() - startTime,
      date_range: dateRange,
      unique_subjects: subjects.length,
      triggered_by_email: email.id,
    };

    // Upsert into conversation_outputs (only update content and metadata, preserve summary)
    await query(
      `
      INSERT INTO conversation_outputs
        (conversation_id, content, metadata, pipeline_version)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (conversation_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      `,
      [conversationId, conversationContent, metadata, "v1"]
    );

    console.log(
      `[conversation] Completed conversation ${conversationId}: ${emails.length} emails, ${totalTextLength} chars total`
    );
  } catch (error) {
    console.error(`[conversation] Failed for email ${email.id}:`, error);
    throw error;
  }
}
