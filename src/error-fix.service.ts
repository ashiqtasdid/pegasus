import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenRouterClient,
  OpenRouterMessage,
  OpenRouterRequest,
  OpenRouterResponse,
} from './openrouter.client';
import { PluginProject } from './ai-prompt-templates.service';
import { DiskReaderService, DiskProjectInfo } from './disk-reader.service';
import { MavenService, CompilationResult } from './maven.service';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface FileOperation {
  type: 'UPDATE' | 'CREATE' | 'DELETE' | 'RENAME';
  file: {
    path?: string;
    oldPath?: string;
    newPath?: string;
    content?: string;
    reason: string;
  };
}

export interface ErrorFixResponse {
  fixDescription: string;
  operations: FileOperation[];
  buildCommands: string[];
  expectedOutcome: string;
}

export interface ErrorFixResult {
  success: boolean;
  message: string;
  fixAttempted: boolean;
  originalErrors?: string;
  fixResponse?: ErrorFixResponse;
  finalCompilationResult?: CompilationResult;
  iterations?: number;
  maxIterationsReached?: boolean;
  operationsApplied?: number;
}

export interface CompilationErrorContext {
  projectPath: string;
  userId: string;
  pluginName: string;
  compilationLogs: string;
  currentProject: PluginProject;
}

@Injectable()
export class ErrorFixService {
  private readonly MAX_FIX_ITERATIONS = 5;
  // AI Model Configuration - Same as AI Service
  private readonly errorFixModel = 'anthropic/claude-sonnet-4'; // Claude Sonnet 4 for error analysis and fixes

  constructor(
    private readonly configService: ConfigService,
    private readonly openRouterClient: OpenRouterClient,
    private readonly diskReaderService: DiskReaderService,
    private readonly mavenService: MavenService,
  ) {}

  async attemptErrorFix(
    userId: string,
    pluginName: string,
    maxIterations: number = this.MAX_FIX_ITERATIONS,
  ): Promise<ErrorFixResult> {
    try {
      const projectPath = path.join(
        process.cwd(),
        'generated',
        userId,
        pluginName,
      );

      // Check if project exists
      if (!(await fs.pathExists(projectPath))) {
        return {
          success: false,
          message: `Project not found: ${projectPath}`,
          fixAttempted: false,
        };
      }
      let iteration = 0;
      let lastCompilationResult: CompilationResult | null = null;
      let originalErrors: string = '';

      while (iteration < maxIterations) {
        iteration++;

        // Attempt compilation
        const compilationResult =
          await this.mavenService.compilePlugin(projectPath);
        lastCompilationResult = compilationResult;

        // If compilation succeeds, we're done
        if (compilationResult.success) {
          return {
            success: true,
            message: `Project compiled successfully after ${iteration} iteration(s)`,
            fixAttempted: iteration > 1,
            originalErrors: originalErrors,
            finalCompilationResult: compilationResult,
            iterations: iteration,
          };
        } // Store original errors from first iteration
        if (iteration === 1) {
          originalErrors =
            compilationResult.buildOutput ||
            compilationResult.errors ||
            'Unknown compilation error';
        }

        // Read current project state
        const projectInfo = await this.diskReaderService.readProjectFromDisk(
          userId,
          pluginName,
        );
        if (!projectInfo.projectExists || !projectInfo.pluginProject) {
          return {
            success: false,
            message: 'Could not read project from disk for error fixing',
            fixAttempted: true,
            originalErrors: originalErrors,
            iterations: iteration,
          };
        } // Create error context
        const errorContext: CompilationErrorContext = {
          projectPath,
          userId,
          pluginName,
          compilationLogs:
            compilationResult.buildOutput ||
            compilationResult.errors ||
            'No detailed error output',
          currentProject: projectInfo.pluginProject,
        }; // Generate fix using AI
        console.log(
          `🤖 Error Fix Service: Analyzing compilation errors for iteration ${iteration}`,
        );
        console.log(
          `📊 Error Fix Service: Current project has ${projectInfo.pluginProject.files.length} files`,
        );

        // Check if the project has substantial content - if so, be more conservative
        const totalContentLength = projectInfo.pluginProject.files.reduce(
          (sum, file) => sum + file.content.length,
          0,
        );
        console.log(
          `📊 Error Fix Service: Total project content: ${totalContentLength} characters`,
        );

        if (totalContentLength < 1000) {
          console.log(
            `⚠️ Error Fix Service: Project seems minimal (${totalContentLength} chars), might need regeneration rather than fixing`,
          );
        }

        const fixResponse = await this.generateErrorFix(errorContext);
        if (!fixResponse) {
          return {
            success: false,
            message: `Failed to generate fix for compilation errors (iteration ${iteration})`,
            fixAttempted: true,
            originalErrors: originalErrors,
            finalCompilationResult: compilationResult,
            iterations: iteration,
          };
        }

        // Apply the fix operations to disk
        const operationsApplied = await this.applyFixOperations(
          fixResponse,
          errorContext,
        );
        if (operationsApplied === 0) {
          return {
            success: false,
            message: `No valid operations could be applied (iteration ${iteration})`,
            fixAttempted: true,
            originalErrors: originalErrors,
            finalCompilationResult: compilationResult,
            iterations: iteration,
            fixResponse: fixResponse,
          };
        }

        // Log the fix attempt
        console.log(
          `Error fix iteration ${iteration} completed for ${userId}/${pluginName}`,
        );
      }

      // Max iterations reached
      return {
        success: false,
        message: `Could not fix compilation errors after ${maxIterations} attempts`,
        fixAttempted: true,
        originalErrors: originalErrors,
        finalCompilationResult: lastCompilationResult || undefined,
        iterations: maxIterations,
        maxIterationsReached: true,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error during fix attempt: ${error.message}`,
        fixAttempted: true,
      };
    }
  }
  private async generateErrorFix(
    errorContext: CompilationErrorContext,
  ): Promise<ErrorFixResponse | null> {
    console.log(
      `🤖 Error Fix Service: Starting error analysis for "${errorContext.pluginName}"`,
    );
    console.log(
      `🎯 Error Fix Service: Using Claude Sonnet 4 for error analysis and fixes`,
    );

    try {
      const fixPrompt = this.buildErrorFixPrompt(errorContext);
      console.log(
        `📝 Error Fix Service: Built error fix prompt: ${fixPrompt.length} characters`,
      );

      const messages: OpenRouterMessage[] = [
        {
          role: 'system',
          content: `You are a Minecraft plugin compilation error fixing expert. You MUST respond with ONLY a valid JSON object. No explanations, no markdown code blocks, no text outside the JSON structure.

CRITICAL JSON FORMATTING RULES:
1. START your response with { and END with }
2. DO NOT include any text before or after the JSON object
3. DO NOT use markdown code blocks (no \`\`\`json)
4. DO NOT include explanations, comments, or additional text
5. ALL strings must be properly escaped (quotes as \\", newlines as \\n, backslashes as \\\\)
6. File content MUST be complete and valid (no placeholders or partial fixes)

REQUIRED JSON STRUCTURE (respond with exactly this format):
{
  "fixDescription": "string (brief description of compilation errors fixed)",
  "operations": [
    {
      "type": "UPDATE" | "CREATE" | "DELETE" | "RENAME",
      "file": {
        "path": "string (relative file path from project root - REQUIRED for UPDATE/CREATE/DELETE)",
        "oldPath": "string (REQUIRED only for RENAME operations)",
        "newPath": "string (REQUIRED only for RENAME operations)", 
        "content": "string (complete updated file content - properly escaped - REQUIRED for UPDATE/CREATE)",
        "reason": "string (specific compilation error being fixed - REQUIRED)"
      }
    }
  ],
  "buildCommands": ["mvn clean compile", "mvn package"],
  "expectedOutcome": "string (expected compilation result)"
}

CRITICAL ERROR FIXING RULES:
- PRESERVE all existing functionality and complex logic
- ONLY fix actual compilation errors (imports, syntax, API usage)
- DO NOT simplify or replace working complex implementations
- Fix missing imports, wrong method calls, API version issues
- Maintain original plugin structure and all features
- Include COMPLETE file content for UPDATE/CREATE operations
- Focus on MINIMAL changes that resolve compilation issues
- Ensure all modifications are syntactically correct

JSON ESCAPING RULES (CRITICAL):
- Escape quotes: " becomes \\"
- Escape newlines: actual newlines become \\n
- Escape backslashes: \\ becomes \\\\
- Escape tabs: actual tabs become \\t
- NO unescaped quotes or control characters in file content

OPERATION VALIDATION:
- UPDATE/CREATE operations MUST include complete "content"
- DELETE operations MUST include "path" but NO "content"
- RENAME operations MUST include "oldPath" and "newPath"
- All operations MUST include descriptive "reason"

FILE CONTENT REQUIREMENTS:
- Content MUST be complete and compilable
- NO TODOs, FIXMEs, or placeholder comments
- All imports must be correct and complete
- All method signatures must match Minecraft API
- All syntax must be valid Java/YAML/XML

RESPONSE VALIDATION:
Your response will be validated for:
✓ Valid JSON syntax
✓ Required fields present
✓ Proper string escaping
✓ Complete file content
✓ Valid operation types
✓ No markdown or extra text`,
        },
        {
          role: 'user',
          content: fixPrompt,
        },
      ];

      console.log(
        `🌐 Error Fix Service: Calling OpenRouter API with Claude Sonnet 4 for error analysis`,
      );
      const response = await this.openRouterClient.chatCompletion({
        model: this.errorFixModel,
        messages,
        temperature: 0.1,
        max_tokens: 12000, // Allow large responses for complex fixes
      });

      console.log(
        `✅ Error Fix Service: Received response from OpenRouter (${response.usage?.total_tokens || 'unknown'} tokens)`,
      );

      const aiResponse = response.choices[0]?.message?.content || '';
      console.log(
        `� Error Fix Service: Response length: ${aiResponse.length} characters`,
      );

      try {
        // Parse the JSON response using the same logic as AI service        console.log(`🔍 Error Fix Service: Parsing JSON response...`);
        const fixResponse = await this.parseAIFixResponse(aiResponse);
        console.log(
          `✅ Error Fix Service: Successfully parsed JSON fix response`,
        );
        console.log(
          `🔧 Error Fix Service: Generated ${fixResponse.operations?.length || 0} operations for error fixing`,
        );

        // Validate the response structure
        if (!fixResponse.operations || !Array.isArray(fixResponse.operations)) {
          console.log(`❌ Error Fix Service: Invalid fix response structure`);
          throw new Error(
            'Invalid fix response: missing or invalid operations array',
          );
        }

        console.log(
          `🎉 Error Fix Service: Error analysis completed successfully`,
        );
        return fixResponse;
      } catch (parseError) {
        console.log(
          `⚠️ Error Fix Service: JSON parsing failed: ${parseError.message}`,
        );
        console.log(
          `📄 Error Fix Service: Raw response preview (first 500 chars): ${aiResponse.substring(0, 500)}`,
        );
        console.log(
          `📄 Error Fix Service: Raw response preview (last 100 chars): ${aiResponse.substring(Math.max(0, aiResponse.length - 100))}`,
        );
        return null;
      }
    } catch (error) {
      console.error(
        `❌ Error Fix Service: Error generating fix: ${error.message}`,
      );
      return null;
    }
  }
  private buildErrorFixPrompt(errorContext: CompilationErrorContext): string {
    console.log(
      `🔧 Error Fix Service: Building error fix prompt for "${errorContext.pluginName}"`,
    );
    const { compilationLogs, currentProject, pluginName } = errorContext;

    // Create a complete project snapshot as JSON
    console.log(
      `📁 Error Fix Service: Creating project snapshot with ${currentProject.files.length} files`,
    );
    const projectSnapshot = JSON.stringify(
      {
        projectName: currentProject.projectName,
        minecraftVersion: currentProject.minecraftVersion,
        files: currentProject.files,
        dependencies: currentProject.dependencies,
        buildInstructions: currentProject.buildInstructions,
      },
      null,
      2,
    );

    const prompt = `PROJECT COMPILATION ERROR ANALYSIS

PROJECT DETAILS:
- Name: ${currentProject.projectName}
- Minecraft Version: ${currentProject.minecraftVersion}
- Files Count: ${currentProject.files.length}

CURRENT PROJECT STATE:
${projectSnapshot}

COMPILATION ERRORS TO ANALYZE AND FIX:
${compilationLogs}

INSTRUCTIONS:
You are analyzing compilation errors for a Minecraft plugin project. Your goal is to provide targeted fixes that resolve compilation issues while preserving existing functionality.

CRITICAL REQUIREMENTS:
- Analyze the compilation errors carefully
- Preserve existing functionality and complex logic wherever possible
- ONLY fix actual compilation errors, don't simplify working code
- Fix imports, syntax errors, missing dependencies, incorrect API usage
- DO NOT replace complex implementations with simple ones
- Maintain the original plugin structure and features
- Include complete file content for UPDATE/CREATE operations
- Focus on minimal changes that resolve compilation issues
- Ensure all file paths are relative to the project root
- Make sure all modifications are syntactically correct and follow Java best practices`;

    console.log(
      `✅ Error Fix Service: Built error fix prompt (${prompt.length} characters)`,
    );
    return prompt;
  }
  private async applyFixOperations(
    fixResponse: ErrorFixResponse,
    errorContext: CompilationErrorContext,
  ): Promise<number> {
    console.log(
      `🔧 Error Fix Service: Applying ${fixResponse.operations.length} fix operations`,
    );
    console.log(
      `📝 Error Fix Service: Fix description: ${fixResponse.fixDescription}`,
    );

    let operationsApplied = 0;

    try {
      for (const operation of fixResponse.operations) {
        console.log(
          `🔄 Error Fix Service: Processing ${operation.type} operation for ${operation.file.path || operation.file.oldPath || 'unknown'}`,
        );

        try {
          switch (operation.type) {
            case 'UPDATE':
            case 'CREATE':
              if (operation.file.path && operation.file.content) {
                const filePath = path.join(
                  errorContext.projectPath,
                  operation.file.path,
                );
                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, operation.file.content, 'utf8');
                console.log(
                  `✅ ${operation.type}: ${operation.file.path} - ${operation.file.reason}`,
                );
                operationsApplied++;
              } else {
                console.warn(
                  `⚠️ Skipping ${operation.type} operation: missing path or content`,
                );
              }
              break;

            case 'DELETE':
              if (operation.file.path) {
                const filePath = path.join(
                  errorContext.projectPath,
                  operation.file.path,
                );
                if (await fs.pathExists(filePath)) {
                  await fs.remove(filePath);
                  console.log(
                    `✅ DELETE: ${operation.file.path} - ${operation.file.reason}`,
                  );
                  operationsApplied++;
                } else {
                  console.warn(
                    `⚠️ File not found for deletion: ${operation.file.path}`,
                  );
                }
              } else {
                console.warn(`⚠️ Skipping DELETE operation: missing path`);
              }
              break;

            case 'RENAME':
              if (operation.file.oldPath && operation.file.newPath) {
                const oldFilePath = path.join(
                  errorContext.projectPath,
                  operation.file.oldPath,
                );
                const newFilePath = path.join(
                  errorContext.projectPath,
                  operation.file.newPath,
                );
                if (await fs.pathExists(oldFilePath)) {
                  await fs.ensureDir(path.dirname(newFilePath));
                  await fs.move(oldFilePath, newFilePath);
                  console.log(
                    `✅ RENAME: ${operation.file.oldPath} -> ${operation.file.newPath} - ${operation.file.reason}`,
                  );
                  operationsApplied++;
                } else {
                  console.warn(
                    `⚠️ Source file not found for rename: ${operation.file.oldPath}`,
                  );
                }
              } else {
                console.warn(
                  `⚠️ Skipping RENAME operation: missing oldPath or newPath`,
                );
              }
              break;

            default:
              console.warn(`⚠️ Unknown operation type: ${operation.type}`);
          }
        } catch (opError) {
          console.error(
            `❌ Failed to apply operation ${operation.type} for ${operation.file.path || operation.file.oldPath}:`,
            opError.message,
          );
        }
      }

      console.log(
        `📊 Error Fix Service: Successfully applied ${operationsApplied} of ${fixResponse.operations.length} operations`,
      ); // Update project-info.json with fix information
      const projectInfoPath = path.join(
        errorContext.projectPath,
        'project-info.json',
      );
      if (await this.safePathExists(projectInfoPath)) {
        try {
          const projectInfoContent = await this.safeReadFile(
            projectInfoPath,
            'utf8',
          );
          const projectInfo: any = this.safeJSONParse(projectInfoContent, {});

          projectInfo.lastFixAttempt = {
            timestamp: new Date().toISOString(),
            fixDescription: fixResponse.fixDescription,
            operationsApplied: operationsApplied,
            expectedOutcome: fixResponse.expectedOutcome,
          };

          const updatedInfo = this.safeJSONStringify(projectInfo);
          await this.safeWriteFile(projectInfoPath, updatedInfo, 'utf8');
          console.log(
            `📄 Error Fix Service: Updated project-info.json with fix details`,
          );
        } catch (error) {
          console.warn(
            `⚠️ Error Fix Service: Could not update project-info.json: ${error.message}`,
          );
        }
      }
    } catch (error) {
      console.error(
        `❌ Error Fix Service: Error applying fix operations: ${error.message}`,
      );
    }

    console.log(
      `🎯 Error Fix Service: Completed operation application - ${operationsApplied} operations applied`,
    );
    return operationsApplied;
  }

  private extractErrorSummary(compilationOutput: string): string {
    try {
      const lines = compilationOutput.split('\n');
      const errorLines = lines.filter(
        (line) =>
          line.includes('[ERROR]') ||
          line.includes('error:') ||
          line.includes('cannot find symbol') ||
          line.includes('package does not exist') ||
          line.includes('cannot resolve'),
      );

      // Get first 10 most relevant error lines
      const summary = errorLines.slice(0, 10).join('\n');

      if (summary.length === 0) {
        return 'Compilation failed but no specific error details found';
      }
      return summary;
    } catch (error) {
      return 'Could not extract error summary from compilation output';
    }
  }

  async fixAndCompile(
    userId: string,
    pluginName: string,
    maxIterations: number = this.MAX_FIX_ITERATIONS,
  ): Promise<ErrorFixResult> {
    const result = await this.attemptErrorFix(
      userId,
      pluginName,
      maxIterations,
    );

    // Add final compilation status to the result
    if (result.success && !result.finalCompilationResult) {
      const finalCompilation =
        await this.mavenService.compilePluginByUserAndName(userId, pluginName);
      result.finalCompilationResult = finalCompilation;
    }

    return result;
  }

  async analyzeCompilationErrors(
    userId: string,
    pluginName: string,
  ): Promise<{
    hasErrors: boolean;
    errorSummary: string;
    compilationOutput: string;
    canAttemptFix: boolean;
  }> {
    try {
      const projectPath = path.join(
        process.cwd(),
        'generated',
        userId,
        pluginName,
      );

      if (!(await fs.pathExists(projectPath))) {
        return {
          hasErrors: true,
          errorSummary: 'Project not found',
          compilationOutput: '',
          canAttemptFix: false,
        };
      }

      const compilationResult =
        await this.mavenService.compilePlugin(projectPath);
      return {
        hasErrors: !compilationResult.success,
        errorSummary: compilationResult.success
          ? 'No errors'
          : this.extractErrorSummary(
              compilationResult.buildOutput || compilationResult.errors || '',
            ),
        compilationOutput:
          compilationResult.buildOutput ||
          compilationResult.errors ||
          'No output available',
        canAttemptFix: !compilationResult.success,
      };
    } catch (error) {
      return {
        hasErrors: true,
        errorSummary: `Analysis failed: ${error.message}`,
        compilationOutput: '',
        canAttemptFix: false,
      };
    }
  }

  private async writeProjectToDisk(
    pluginProject: PluginProject,
    userId: string,
    pluginName: string,
  ): Promise<void> {
    try {
      const projectPath = path.join(
        process.cwd(),
        'generated',
        userId,
        pluginName,
      );

      // Ensure the project directory exists
      await fs.ensureDir(projectPath); // Write all the files from the plugin project
      for (const file of pluginProject.files) {
        const filePath = path.join(projectPath, file.path);

        // Ensure the directory exists for this file
        await fs.ensureDir(path.dirname(filePath));

        // Write the file content safely
        await this.safeWriteFile(filePath, file.content, 'utf8');
      }

      // Update the project summary file
      const projectSummary = {
        ...pluginProject,
        generatedAt: new Date().toISOString(),
        userId,
        lastFixed: new Date().toISOString(),
      };

      const summaryPath = path.join(projectPath, 'project-info.json');
      const summaryContent = this.safeJSONStringify(projectSummary);
      await this.safeWriteFile(summaryPath, summaryContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write project to disk: ${error.message}`);
    }
  }
  /**
   * Robust JSON parsing for AI fix responses with comprehensive error handling
   */
  private async parseAIFixResponse(
    aiResponse: string,
  ): Promise<ErrorFixResponse> {
    console.log(
      `🔍 Error Fix Service: Starting robust JSON parsing (${aiResponse.length} chars)`,
    );

    // Step 1: Pre-validation checks
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty AI fix response received');
    }

    // Step 2: Clean and normalize the response
    let cleanedResponse = this.cleanAIResponse(aiResponse);
    console.log(
      `🧹 Error Fix Service: Cleaned response (${cleanedResponse.length} chars)`,
    );

    // Step 3: Validate basic JSON structure
    if (!this.isValidJSONStructure(cleanedResponse)) {
      console.log(
        `⚠️ Error Fix Service: Invalid JSON structure detected, attempting extraction`,
      );
      cleanedResponse = this.extractJSONFromResponse(cleanedResponse);
    }

    // Step 4: Try multiple parsing strategies with enhanced validation
    const parsingStrategies = [
      () => this.parseDirectJSON(cleanedResponse),
      () => this.parseWithRegexExtraction(cleanedResponse),
      () => this.parseWithFallbackCleaning(cleanedResponse),
      () => this.parseWithBracketMatching(cleanedResponse),
      () => this.parseWithQuoteEscaping(cleanedResponse),
      () => this.parseWithAdvancedCleaning(cleanedResponse),
    ];

    for (let i = 0; i < parsingStrategies.length; i++) {
      try {
        console.log(
          `🔍 Error Fix Service: Trying parsing strategy ${i + 1}...`,
        );
        const result = parsingStrategies[i]();
        if (result) {
          // Enhanced validation before accepting result
          const validationResult = this.validateFixResponseStructure(result);
          if (validationResult.isValid) {
            const validatedResponse =
              this.validateAndSanitizeFixResponse(result);
            console.log(
              `✅ Error Fix Service: Successfully parsed with strategy ${i + 1}`,
            );
            return validatedResponse;
          } else {
            console.log(
              `⚠️ Error Fix Service: Strategy ${i + 1} parsed but failed validation: ${validationResult.errors.join(', ')}`,
            );
            continue;
          }
        }
      } catch (error) {
        console.log(
          `⚠️ Error Fix Service: Strategy ${i + 1} failed: ${error.message}`,
        );
        continue;
      }
    }

    throw new Error(
      'All JSON parsing strategies failed for error fix response with enhanced validation',
    );
  }

  /**
   * Clean and normalize AI response for parsing
   */
  private cleanAIResponse(response: string): string {
    let cleaned = response.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Remove any leading/trailing non-JSON text
    cleaned = cleaned.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

    return cleaned;
  }

  /**
   * Direct JSON parsing attempt
   */
  private parseDirectJSON(jsonString: string): ErrorFixResponse | null {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse using regex to extract JSON object
   */
  private parseWithRegexExtraction(input: string): ErrorFixResponse | null {
    try {
      const jsonMatch = input.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse with additional cleaning for malformed JSON
   */
  private parseWithFallbackCleaning(input: string): ErrorFixResponse | null {
    try {
      let cleaned = input;

      // Fix common JSON issues
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
      cleaned = cleaned.replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys
      cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single quotes with double quotes

      return JSON.parse(cleaned);
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse using bracket matching to find valid JSON
   */
  private parseWithBracketMatching(input: string): ErrorFixResponse | null {
    try {
      let braceCount = 0;
      let startIndex = -1;
      let endIndex = -1;

      for (let i = 0; i < input.length; i++) {
        if (input[i] === '{') {
          if (startIndex === -1) startIndex = i;
          braceCount++;
        } else if (input[i] === '}') {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            endIndex = i;
            break;
          }
        }
      }

      if (startIndex !== -1 && endIndex !== -1) {
        const jsonCandidate = input.substring(startIndex, endIndex + 1);
        return JSON.parse(jsonCandidate);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse with special handling for escaped quotes in file content
   */
  private parseWithQuoteEscaping(input: string): ErrorFixResponse | null {
    try {
      let processed = input;

      // Special handling for file content with escaped quotes
      processed = processed
        .replace(/\\"/g, '\\"')
        .replace(/\\n/g, '\\n')
        .replace(/\\\\/g, '\\\\');

      return JSON.parse(processed);
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate basic JSON structure before parsing
   */
  private isValidJSONStructure(input: string): boolean {
    const trimmed = input.trim();
    return (
      trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.length > 10
    );
  }

  /**
   * Extract JSON from mixed content response
   */
  private extractJSONFromResponse(input: string): string {
    const firstBrace = input.indexOf('{');
    const lastBrace = input.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return input.substring(firstBrace, lastBrace + 1);
    }

    return input;
  }

  /**
   * Advanced cleaning for complex malformed JSON in error fix responses
   */
  private parseWithAdvancedCleaning(input: string): ErrorFixResponse | null {
    try {
      let cleaned = input;

      // Advanced JSON repair strategies for error fix responses
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
      cleaned = cleaned.replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys
      cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single quotes with double quotes
      cleaned = cleaned.replace(/\\n/g, '\\\\n'); // Fix newline escaping
      cleaned = cleaned.replace(/\\"/g, '\\\\"'); // Fix quote escaping
      cleaned = cleaned.replace(/\n/g, '\\n'); // Escape actual newlines
      cleaned = cleaned.replace(/\r/g, ''); // Remove carriage returns
      cleaned = cleaned.replace(/\t/g, '\\t'); // Escape tabs

      // Fix operation content escaping issues
      cleaned = cleaned.replace(
        /"content":\s*"([^"]*(?:\\"[^"]*)*)"(?=\s*,|\s*})/g,
        (match, content) => {
          const properlyEscaped = content
            .replace(/\\"/g, '"')
            .replace(/"/g, '\\"');
          return `"content": "${properlyEscaped}"`;
        },
      );

      return JSON.parse(cleaned);
    } catch (error) {
      return null;
    }
  }

  /**
   * Comprehensive error fix response structure validation
   */
  private validateFixResponseStructure(obj: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check top-level structure
    if (!obj || typeof obj !== 'object') {
      errors.push('Response is not an object');
      return { isValid: false, errors };
    }

    // Check required fields
    const requiredFields = [
      'fixDescription',
      'operations',
      'buildCommands',
      'expectedOutcome',
    ];
    for (const field of requiredFields) {
      if (!(field in obj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate fixDescription
    if (
      obj.fixDescription &&
      (typeof obj.fixDescription !== 'string' ||
        obj.fixDescription.trim().length === 0)
    ) {
      errors.push('fixDescription must be a non-empty string');
    }

    // Validate operations array
    if (obj.operations) {
      if (!Array.isArray(obj.operations)) {
        errors.push('operations must be an array');
      } else {
        obj.operations.forEach((operation: any, index: number) => {
          if (!operation || typeof operation !== 'object') {
            errors.push(`Operation ${index} is not an object`);
            return;
          }

          // Validate operation type
          const validTypes = ['UPDATE', 'CREATE', 'DELETE', 'RENAME'];
          if (!operation.type || !validTypes.includes(operation.type)) {
            errors.push(
              `Operation ${index} has invalid type: ${operation.type}`,
            );
          }

          // Validate file object
          if (!operation.file || typeof operation.file !== 'object') {
            errors.push(`Operation ${index} missing file object`);
            return;
          }

          // Validate required fields based on operation type
          if (operation.type === 'RENAME') {
            if (!operation.file.oldPath || !operation.file.newPath) {
              errors.push(
                `RENAME operation ${index} missing oldPath or newPath`,
              );
            }
          } else if (operation.type === 'DELETE') {
            if (!operation.file.path) {
              errors.push(`DELETE operation ${index} missing path`);
            }
          } else if (
            operation.type === 'UPDATE' ||
            operation.type === 'CREATE'
          ) {
            if (!operation.file.path) {
              errors.push(`${operation.type} operation ${index} missing path`);
            }
            if (
              !operation.file.content ||
              typeof operation.file.content !== 'string'
            ) {
              errors.push(
                `${operation.type} operation ${index} missing or invalid content`,
              );
            }
          }

          // Validate reason
          if (
            !operation.file.reason ||
            typeof operation.file.reason !== 'string'
          ) {
            errors.push(`Operation ${index} missing reason`);
          }
        });
      }
    }

    // Validate buildCommands
    if (obj.buildCommands && !Array.isArray(obj.buildCommands)) {
      errors.push('buildCommands must be an array');
    }

    // Validate expectedOutcome
    if (
      obj.expectedOutcome &&
      (typeof obj.expectedOutcome !== 'string' ||
        obj.expectedOutcome.trim().length === 0)
    ) {
      errors.push('expectedOutcome must be a non-empty string');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate and sanitize the parsed fix response
   */
  private validateAndSanitizeFixResponse(response: any): ErrorFixResponse {
    const sanitized: ErrorFixResponse = {
      fixDescription: this.validateString(
        response.fixDescription,
        'Automated error fix',
      ),
      operations: this.validateOperations(response.operations),
      buildCommands: this.validateArray(response.buildCommands, [
        'mvn clean compile',
      ]),
      expectedOutcome: this.validateString(
        response.expectedOutcome,
        'Compilation errors resolved',
      ),
    };

    console.log(
      `🔧 Error Fix Service: Validated fix response with ${sanitized.operations.length} operations`,
    );
    return sanitized;
  }

  /**
   * Validate string fields with fallback
   */
  private validateString(value: any, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : fallback;
  }

  /**
   * Validate array fields with fallback
   */
  private validateArray(value: any, fallback: string[]): string[] {
    return Array.isArray(value) && value.length > 0 ? value : fallback;
  }

  /**
   * Validate and sanitize operations array
   */
  private validateOperations(operations: any): FileOperation[] {
    if (!Array.isArray(operations)) {
      console.log(
        `⚠️ Error Fix Service: Operations is not an array, returning empty array`,
      );
      return [];
    }

    const validOperations: FileOperation[] = [];

    for (const op of operations) {
      try {
        if (this.isValidOperation(op)) {
          validOperations.push({
            type: op.type,
            file: {
              path: op.file?.path?.trim() || undefined,
              oldPath: op.file?.oldPath?.trim() || undefined,
              newPath: op.file?.newPath?.trim() || undefined,
              content: this.sanitizeFileContent(op.file?.content),
              reason: this.validateString(op.file?.reason, 'File operation'),
            },
          });
        } else {
          console.log(`⚠️ Error Fix Service: Skipping invalid operation:`, op);
        }
      } catch (error) {
        console.log(
          `⚠️ Error Fix Service: Error processing operation: ${error.message}`,
        );
      }
    }

    return validOperations;
  }

  /**
   * Check if an operation object is valid
   */
  private isValidOperation(operation: any): boolean {
    const validTypes = ['UPDATE', 'CREATE', 'DELETE', 'RENAME'];
    return (
      operation &&
      validTypes.includes(operation.type) &&
      operation.file &&
      typeof operation.file === 'object'
    );
  }
  /**
   * Sanitize file content to prevent issues
   */
  private sanitizeFileContent(content: any): string | undefined {
    if (content === null || content === undefined) {
      return undefined;
    }

    if (typeof content !== 'string') {
      return String(content);
    }

    // Normalize line endings and ensure proper escaping
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Safely read a file with comprehensive error handling
   */
  private async safeReadFile(
    filePath: string,
    encoding: BufferEncoding = 'utf8',
  ): Promise<string> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }
      if (stats.size > 50 * 1024 * 1024) {
        // 50MB limit
        throw new Error(`File too large: ${filePath} (${stats.size} bytes)`);
      }
      const content = await fs.readFile(filePath, encoding);
      if (typeof content !== 'string') {
        throw new Error(`File content is not a string: ${filePath}`);
      }
      return content;
    } catch (error) {
      console.error(
        `❌ Error Fix Service: Error reading file ${filePath}: ${error.message}`,
      );
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Safely write a file with comprehensive error handling
   */
  private async safeWriteFile(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf8',
  ): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(filePath));
      if (typeof content !== 'string') {
        content = String(content);
      }
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      try {
        await fs.writeFile(tempPath, content, encoding);
        await fs.move(tempPath, filePath);
        console.log(
          `✅ Error Fix Service: Successfully wrote file: ${filePath} (${content.length} chars)`,
        );
      } catch (writeError) {
        if (await fs.pathExists(tempPath)) {
          await fs.remove(tempPath);
        }
        throw writeError;
      }
    } catch (error) {
      console.error(
        `❌ Error Fix Service: Error writing file ${filePath}: ${error.message}`,
      );
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Safely parse JSON with fallback and error handling
   */
  private safeJSONParse<T>(jsonString: string, fallback: T): T {
    if (
      !jsonString ||
      typeof jsonString !== 'string' ||
      jsonString.trim().length === 0
    ) {
      console.log(
        `⚠️ Error Fix Service: Empty or invalid JSON string, using fallback`,
      );
      return fallback;
    }
    try {
      const trimmed = jsonString.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        console.log(
          `⚠️ Error Fix Service: JSON string doesn't start with { or [, using fallback`,
        );
        return fallback;
      }
      const parsed = JSON.parse(trimmed);
      if (parsed === null || parsed === undefined) {
        console.log(
          `⚠️ Error Fix Service: Parsed JSON is null/undefined, using fallback`,
        );
        return fallback;
      }
      return parsed;
    } catch (error) {
      console.warn(
        `⚠️ Error Fix Service: JSON parsing failed: ${error.message}, using fallback`,
      );
      return fallback;
    }
  }

  /**
   * Safely stringify JSON with error handling
   */
  private safeJSONStringify(object: any, indent: number = 2): string {
    try {
      if (object === null || object === undefined) {
        return '{}';
      }
      return JSON.stringify(object, null, indent);
    } catch (error) {
      console.warn(
        `⚠️ Error Fix Service: JSON stringification failed: ${error.message}`,
      );
      return '{}';
    }
  }

  /**
   * Safely check if a path exists with error handling
   */
  private async safePathExists(filePath: string): Promise<boolean> {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      console.warn(
        `⚠️ Error Fix Service: Error checking path existence for ${filePath}: ${error.message}`,
      );
      return false;
    }
  }
}
