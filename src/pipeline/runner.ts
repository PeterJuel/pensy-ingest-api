import { query } from "../lib/db";
import { stripHtml } from "./steps/stripHtml";

interface Email {
  id: string;
  subject: string;
  body: any;
  conversation_id: string | null;
}

export async function runPipelineSteps(emailId: string) {
  // Load the email
  const [email] = await query<Email>(
    `SELECT id, subject, body, conversation_id FROM emails WHERE id = $1`,
    [emailId]
  );

  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  console.log(`Running pipeline for email ${emailId}`);

  // Step 1: Strip HTML to get plain text
  await stripHtml(email);

  // Future steps will go here:
  // await chunkText(email);
  // await generateSummary(email);
  // await categorizeEmail(email);
  // etc.

  console.log(`Pipeline completed for email ${emailId}`);
}
