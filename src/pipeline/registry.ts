import { PipelineOrchestrator } from "./orchestrator";
import { stripHtmlStep } from "./steps";

// Create and configure the global orchestrator
export const orchestrator = new PipelineOrchestrator();

// Register all steps
orchestrator.registerStep(stripHtmlStep);

console.log(
  "Pipeline orchestrator initialized with steps:",
  orchestrator.getSteps().map((s) => s.name)
);
