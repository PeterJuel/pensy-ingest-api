// src/pipeline/runner.ts
import { orchestrator } from "./registry";
import logger from "../lib/logger";

export async function runPipelineSteps(
  emailId: string,
  requestedSteps?: string[]
) {
  try {
    // For manual step selection, skip dependencies
    const skipDependencies = requestedSteps && requestedSteps.length > 0;
    const context = await orchestrator.executeSteps(
      emailId,
      requestedSteps,
      skipDependencies
    );

    if (context.failedSteps.size > 0) {
      logger.warn("Pipeline completed with failed steps", "RUNNER", {
        emailId,
        failedStepsCount: context.failedSteps.size,
        failedSteps: Array.from(context.failedSteps)
      });
    }

    return context;
  } catch (error) {
    logger.error("Pipeline execution failed", "RUNNER", { 
      emailId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}


// Function to run specific steps (useful for admin actions)
export async function runSpecificSteps(emailId: string, stepNames: string[]) {
  // For admin manual selection, always skip dependencies
  return orchestrator.executeSteps(emailId, stepNames, true);
}

// Function to get pipeline stats
export async function getPipelineStats(emailId?: string) {
  return orchestrator.getExecutionStats(emailId);
}
