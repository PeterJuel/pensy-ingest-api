// src/pipeline/orchestrator.ts
import { query } from "../lib/db";
import {
  PipelineStep,
  PipelineContext,
  ExecutionPlan,
  StepResult,
  Email,
} from "./types";

export class PipelineOrchestrator {
  private steps: Map<string, PipelineStep> = new Map();
  private defaultTimeout = 30000; // 30 seconds

  /**
   * Register a pipeline step
   */
  registerStep(step: PipelineStep): void {
    // Validate step configuration
    if (!step.name || typeof step.name !== "string") {
      throw new Error("Step name is required and must be a string");
    }

    if (!Array.isArray(step.dependencies)) {
      throw new Error("Step dependencies must be an array");
    }

    if (typeof step.execute !== "function") {
      throw new Error("Step execute must be a function");
    }

    // Check for circular dependencies
    this.validateNoCycles(step.name, step.dependencies);

    this.steps.set(step.name, step);
    // console.log(`Registered pipeline step: ${step.name}`); // Commented out to reduce log spam
  }

  /**
   * Get all registered steps
   */
  getSteps(): PipelineStep[] {
    return Array.from(this.steps.values());
  }

  /**
   * Execute specific steps for an email (with optional dependency resolution)
   */
  async executeSteps(
    emailId: string,
    requestedSteps?: string[],
    skipDependencies: boolean = false
  ): Promise<PipelineContext> {
    console.log(`Starting pipeline execution for email ${emailId}`);

    // Load email
    const email = await this.loadEmail(emailId);
    if (!email) {
      throw new Error(`Email not found: ${emailId}`);
    }

    // Create execution context
    const context: PipelineContext = {
      emailId,
      email,
      completedSteps: new Set(),
      failedSteps: new Set(),
      stepResults: new Map(),
      startTime: Date.now(),
    };

    // Determine which steps to run
    const stepsToRun = requestedSteps || Array.from(this.steps.keys());

    // Create execution plan with or without dependency resolution
    const plan = this.createExecutionPlan(
      stepsToRun,
      new Set(),
      skipDependencies
    );

    console.log(`Execution plan for ${emailId}:`, {
      totalSteps: plan.totalSteps,
      parallelGroups: plan.parallelGroups.length,
      requestedSteps: stepsToRun,
      skipDependencies,
    });

    // Update processing status
    await this.updateProcessingStatus(emailId, "processing", plan.steps[0]);

    // Execute steps in dependency order
    try {
      await this.executePlan(context, plan);

      // Mark as completed if all steps succeeded
      if (context.failedSteps.size === 0) {
        await this.updateProcessingStatus(emailId, "completed");
        console.log(`Pipeline completed successfully for email ${emailId}`);
      } else {
        await this.updateProcessingStatus(emailId, "partial_failure");
        console.log(
          `Pipeline completed with failures for email ${emailId}:`,
          Array.from(context.failedSteps)
        );
      }
    } catch (error) {
      await this.updateProcessingStatus(emailId, "failed");
      console.error(`Pipeline failed for email ${emailId}:`, error);
      throw error;
    }

    return context;
  }

  /**
   * Execute all registered steps for an email
   */
  async executeAll(emailId: string): Promise<PipelineContext> {
    return this.executeSteps(emailId);
  }

  /**
   * Create execution plan with topological sort
   */
  private createExecutionPlan(
    requestedSteps: string[],
    _completedSteps: Set<string>,
    skipDependencies: boolean = false
  ): ExecutionPlan {
    // Validate requested steps exist
    const stepsToRun = requestedSteps.filter((stepName) => {
      if (!this.steps.has(stepName)) {
        throw new Error(`Unknown pipeline step: ${stepName}`);
      }
      return true;
    });

    if (stepsToRun.length === 0) {
      return { steps: [], parallelGroups: [], totalSteps: 0 };
    }

    let allRequiredSteps: Set<string>;

    if (skipDependencies) {
      // Just run the requested steps without dependencies
      allRequiredSteps = new Set(stepsToRun);
    } else {
      // Include dependencies (always execute dependencies too)
      allRequiredSteps = new Set<string>();
      const addStepAndDependencies = (stepName: string) => {
        if (allRequiredSteps.has(stepName)) {
          return;
        }

        const step = this.steps.get(stepName);
        if (!step) {
          throw new Error(`Unknown pipeline step: ${stepName}`);
        }

        // Add dependencies first
        for (const dep of step.dependencies) {
          addStepAndDependencies(dep);
        }

        allRequiredSteps.add(stepName);
      };

      stepsToRun.forEach(addStepAndDependencies);
    }

    // Topological sort to determine execution order
    const sortedSteps = this.topologicalSort(Array.from(allRequiredSteps));

    // Group steps that can run in parallel
    const parallelGroups = this.createParallelGroups(sortedSteps);

    return {
      steps: sortedSteps,
      parallelGroups,
      totalSteps: sortedSteps.length,
    };
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(stepNames: string[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (stepName: string) => {
      if (visiting.has(stepName)) {
        throw new Error(
          `Circular dependency detected involving step: ${stepName}`
        );
      }
      if (visited.has(stepName)) {
        return;
      }

      visiting.add(stepName);

      const step = this.steps.get(stepName);
      if (step) {
        for (const dep of step.dependencies) {
          if (stepNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(stepName);
      visited.add(stepName);
      result.push(stepName);
    };

    stepNames.forEach(visit);
    return result;
  }

  /**
   * Group steps that can run in parallel
   */
  private createParallelGroups(sortedSteps: string[]): string[][] {
    const groups: string[][] = [];
    const stepLevels = new Map<string, number>();

    // Calculate dependency level for each step
    for (const stepName of sortedSteps) {
      const step = this.steps.get(stepName)!;
      let maxDepLevel = -1;

      for (const dep of step.dependencies) {
        const depLevel = stepLevels.get(dep);
        if (depLevel !== undefined && depLevel > maxDepLevel) {
          maxDepLevel = depLevel;
        }
      }

      stepLevels.set(stepName, maxDepLevel + 1);
    }

    // Group by level
    const levelGroups = new Map<number, string[]>();
    for (const [stepName, level] of stepLevels) {
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(stepName);
    }

    // Convert to array format
    for (let level = 0; level < levelGroups.size; level++) {
      const group = levelGroups.get(level);
      if (group) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Execute the planned steps
   */
  private async executePlan(
    context: PipelineContext,
    plan: ExecutionPlan
  ): Promise<void> {
    for (
      let groupIndex = 0;
      groupIndex < plan.parallelGroups.length;
      groupIndex++
    ) {
      const group = plan.parallelGroups[groupIndex];

      console.log(
        `Executing parallel group ${groupIndex + 1}/${
          plan.parallelGroups.length
        } for email ${context.emailId}:`,
        group
      );

      // Execute all steps in this group in parallel
      const groupPromises = group.map((stepName) =>
        this.executeStep(context, stepName)
      );

      try {
        await Promise.allSettled(groupPromises);
      } catch (error) {
        console.error(`Error in parallel group execution:`, error);
        // Continue to next group even if some steps fail
      }

      // Update current step for status tracking
      const nextGroup = plan.parallelGroups[groupIndex + 1];
      if (nextGroup && nextGroup.length > 0) {
        await this.updateProcessingStatus(
          context.emailId,
          "processing",
          nextGroup[0]
        );
      }
    }
  }

  /**
   * Execute a single step with error handling and logging
   */
  private async executeStep(
    context: PipelineContext,
    stepName: string
  ): Promise<void> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Step not found: ${stepName}`);
    }

    const startTime = Date.now();
    console.log(`Executing step: ${stepName} for email ${context.emailId}`);

    try {
      // Execute with timeout
      const timeout = step.timeout || this.defaultTimeout;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(new Error(`Step ${stepName} timed out after ${timeout}ms`)),
          timeout
        );
      });

      await Promise.race([step.execute(context.email), timeoutPromise]);

      const duration = Date.now() - startTime;

      // Record success
      const result: StepResult = {
        success: true,
        duration,
        metadata: { executedAt: new Date().toISOString() },
      };

      context.stepResults.set(stepName, result);
      context.completedSteps.add(stepName);

      // Log success to database
      await query(
        `INSERT INTO pipeline_logs (email_id, step, status, details)
         VALUES ($1, $2, $3, $4)`,
        [
          context.emailId,
          stepName,
          "ok",
          { duration, executedAt: new Date().toISOString() },
        ]
      );

      console.log(`Step completed: ${stepName} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Record failure
      const result: StepResult = {
        success: false,
        error: errorMessage,
        duration,
        metadata: { executedAt: new Date().toISOString() },
      };

      context.stepResults.set(stepName, result);
      context.failedSteps.add(stepName);

      // Log error to database
      await query(
        `INSERT INTO pipeline_logs (email_id, step, status, details)
         VALUES ($1, $2, $3, $4)`,
        [
          context.emailId,
          stepName,
          "error",
          {
            error: errorMessage,
            duration,
            executedAt: new Date().toISOString(),
          },
        ]
      );

      console.error(`Step failed: ${stepName} (${duration}ms):`, errorMessage);

      // Don't throw if step is marked as non-retryable or this is a dependency failure
      if (!step.retryable) {
        console.log(
          `Step ${stepName} marked as non-retryable, continuing pipeline`
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Load email from database
   */
  private async loadEmail(emailId: string): Promise<Email | null> {
    const [email] = await query<Email>(
      `SELECT id, subject, body, conversation_id FROM emails WHERE id = $1`,
      [emailId]
    );
    return email || null;
  }

  /**
   * Update email processing status
   */
  private async updateProcessingStatus(
    emailId: string,
    status: string,
    currentStep?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO email_processing_status (email_id, status, current_step, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (email_id) 
         DO UPDATE SET 
           status = EXCLUDED.status,
           current_step = EXCLUDED.current_step,
           updated_at = EXCLUDED.updated_at,
           completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN now() ELSE email_processing_status.completed_at END`,
        [emailId, status, currentStep]
      );
    } catch (error) {
      // Don't fail the pipeline if status update fails
      console.warn(`Failed to update processing status for ${emailId}:`, error);
    }
  }

  /**
   * Validate no circular dependencies when registering a step
   */
  private validateNoCycles(stepName: string, dependencies: string[]): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const checkCycle = (current: string, path: string[]): void => {
      if (visiting.has(current)) {
        throw new Error(
          `Circular dependency detected: ${path.join(" -> ")} -> ${current}`
        );
      }
      if (visited.has(current)) {
        return;
      }

      visiting.add(current);

      const step = this.steps.get(current);
      if (step) {
        for (const dep of step.dependencies) {
          checkCycle(dep, [...path, current]);
        }
      }

      visiting.delete(current);
      visited.add(current);
    };

    // Check if adding this step would create a cycle
    for (const dep of dependencies) {
      checkCycle(dep, [stepName]);
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(emailId?: string): Promise<any> {
    let query_text: string;
    let params: any[];

    if (emailId) {
      query_text = `
        SELECT 
          step,
          status,
          COUNT(*) as count,
          AVG(
            CASE 
              WHEN details ? 'duration' AND details->>'duration' ~ '^[0-9]+(\.[0-9]+)?$' 
              THEN (details->>'duration')::numeric 
              ELSE NULL 
            END
          ) as avg_duration_ms,
          MIN(ts) as first_execution,
          MAX(ts) as last_execution
        FROM pipeline_logs 
        WHERE email_id = $1
        GROUP BY step, status
        ORDER BY step, status
      `;
      params = [emailId];
    } else {
      query_text = `
        SELECT 
          step,
          status,
          COUNT(*) as count,
          AVG(
            CASE 
              WHEN details ? 'duration' AND details->>'duration' ~ '^[0-9]+(\.[0-9]+)?$' 
              THEN (details->>'duration')::numeric 
              ELSE NULL 
            END
          ) as avg_duration_ms,
          MIN(ts) as first_execution,
          MAX(ts) as last_execution
        FROM pipeline_logs 
        WHERE ts > now() - interval '24 hours'
        GROUP BY step, status
        ORDER BY step, status
      `;
      params = [];
    }

    return await query(query_text, params);
  }
}
