// src/pipeline/runner.ts
import { orchestrator } from "./registry";

export async function runPipelineSteps(
  emailId: string,
  requestedSteps?: string[]
) {
  try {
    const context = await orchestrator.executeSteps(emailId, requestedSteps);

    if (context.failedSteps.size > 0) {
      console.warn(
        `Pipeline completed with ${context.failedSteps.size} failed steps for email ${emailId}:`,
        Array.from(context.failedSteps)
      );
    }

    return context;
  } catch (error) {
    console.error(`Pipeline execution failed for email ${emailId}:`, error);
    throw error;
  }
}

// Convenience function to run all steps
export async function runAllSteps(emailId: string) {
  return orchestrator.executeAll(emailId);
}

// Function to run specific steps (useful for admin actions)
export async function runSpecificSteps(emailId: string, stepNames: string[]) {
  return orchestrator.executeSteps(emailId, stepNames);
}

// Function to get pipeline stats
export async function getPipelineStats(emailId?: string) {
  return orchestrator.getExecutionStats(emailId);
}
