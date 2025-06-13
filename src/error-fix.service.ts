import { Injectable } from '@nestjs/common';
import { AiService, PluginProject } from './ai.service';
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
  private readonly MAX_FIX_ITERATIONS = 3;
  private readonly errorFixModel = 'anthropic/claude-3-5-sonnet-20241022'; // Claude Sonnet 4 for code fixes

  constructor(
    private readonly aiService: AiService,
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
        };        // Generate fix using AI
        console.log(`🤖 Error Fix Service: Analyzing compilation errors for iteration ${iteration}`);
        console.log(`📊 Error Fix Service: Current project has ${projectInfo.pluginProject.files.length} files`);
        
        // Check if the project has substantial content - if so, be more conservative
        const totalContentLength = projectInfo.pluginProject.files.reduce((sum, file) => sum + file.content.length, 0);
        console.log(`📊 Error Fix Service: Total project content: ${totalContentLength} characters`);
        
        if (totalContentLength < 1000) {
          console.log(`⚠️ Error Fix Service: Project seems minimal (${totalContentLength} chars), might need regeneration rather than fixing`);
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
    try {
      const fixPrompt = this.buildErrorFixPrompt(errorContext);

      // Use AI service to get the raw response
      const enhancedPrompt = await this.aiService.enhancePrompt(fixPrompt);
      const rawResponse = await this.callOpenRouterForFix(enhancedPrompt);

      if (!rawResponse) {
        console.error('AI service returned no response for error fix');
        return null;
      }      // Parse the JSON response
      try {
        console.log(`🔍 Error Fix Service: Parsing AI response...`);
        console.log(`📄 Error Fix Service: Raw response length: ${rawResponse.length} characters`);
        
        let jsonString = rawResponse.trim();
        
        // Remove markdown code blocks if present
        if (jsonString.startsWith('```json')) {
          console.log(`🧹 Error Fix Service: Removing markdown json code block wrapper`);
          jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonString.startsWith('```')) {
          console.log(`🧹 Error Fix Service: Removing markdown code block wrapper`);
          jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        // Try to extract JSON object if there's still text around it
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
          console.log(`📦 Error Fix Service: Extracted JSON object from response`);
        }
        
        console.log(`🔍 Error Fix Service: Attempting to parse ${jsonString.length} character JSON string`);
        const fixResponse: ErrorFixResponse = JSON.parse(jsonString);

        // Validate the response structure
        if (!fixResponse.operations || !Array.isArray(fixResponse.operations)) {
          console.error(
            'Invalid fix response: missing or invalid operations array',
          );
          return null;
        }        return fixResponse;
      } catch (parseError) {
        console.error('Failed to parse AI fix response as JSON:', parseError);
        console.error('Raw response length:', rawResponse.length);
        console.error('Raw response preview (first 500 chars):', rawResponse.substring(0, 500));
        console.error('Raw response preview (last 100 chars):', rawResponse.substring(Math.max(0, rawResponse.length - 100)));
        return null;
      }
    } catch (error) {
      console.error('Error generating fix:', error);
      return null;
    }
  }
  private async callOpenRouterForFix(prompt: string): Promise<string | null> {
    console.log(`🔧 Error Fix Service: Using Claude Sonnet 4 for error analysis and fixes`);
    try {
      // Use the same API call pattern as the AI service
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY not configured');
      }

      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':
              process.env.YOUR_SITE_URL || 'http://localhost:3000',
            'X-Title': process.env.YOUR_SITE_NAME || 'Pegasus Plugin Generator',
          },          body: JSON.stringify({
            model: this.errorFixModel, // Claude Sonnet 4 for code fixes
            messages: [
              {
                role: 'system',
                content: 'You are a Minecraft plugin compilation error fixing expert. You MUST respond with ONLY valid JSON. No explanations, no text outside the JSON structure. Your response must be parseable by JSON.parse().'
              },
              {
                role: 'user',
                content: prompt,
              },            ],
            temperature: 0.1
            // No max_tokens limit - allow unlimited code generation for comprehensive fixes
          }),
        },
      );

      const result = await response.json();

      if (!result.choices || result.choices.length === 0) {
        console.error('No choices in OpenRouter response');
        return null;
      }

      return result.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenRouter for fix:', error);
      return null;
    }
  }
  private buildErrorFixPrompt(errorContext: CompilationErrorContext): string {
    const { compilationLogs, currentProject, pluginName } = errorContext;

    // Create a complete project snapshot as JSON
    const projectSnapshot = JSON.stringify(
      {
        projectName: currentProject.projectName,        minecraftVersion: currentProject.minecraftVersion,
        files: currentProject.files,
        dependencies: currentProject.dependencies,
        buildInstructions: currentProject.buildInstructions,
      },
      null,
      2,
    );    return `RESPOND WITH ONLY JSON - NO MARKDOWN, NO CODE BLOCKS, NO OTHER TEXT!

PROJECT: ${currentProject.projectName}
MINECRAFT VERSION: ${currentProject.minecraftVersion}

EXISTING PROJECT FILES:
${projectSnapshot}

COMPILATION ERRORS TO FIX:
${compilationLogs}

RESPOND WITH ONLY RAW JSON (DO NOT use code block markdown formatting):
{
  "fixDescription": "Brief description of what compilation errors were fixed",
  "operations": [
    {
      "type": "UPDATE",
      "file": {
        "path": "relative/file/path",
        "content": "complete updated file content with minimal changes to fix errors only",
        "reason": "specific compilation error being fixed"
      }
    }
  ],
  "buildCommands": ["mvn clean compile package"],
  "expectedOutcome": "compilation success with preserved functionality"
}

CRITICAL RULES FOR ERROR FIXING:
- PRESERVE existing functionality and complex logic wherever possible
- ONLY fix actual compilation errors, don't simplify working code
- Fix imports, syntax errors, missing dependencies, incorrect API usage
- DO NOT replace complex implementations with simple ones
- Maintain the original plugin structure and features
- Include complete file content for UPDATE/CREATE operations
- Focus on minimal changes that resolve compilation issues
- NO markdown formatting, NO code blocks, ONLY raw JSON`;
  }

  private async applyFixOperations(
    fixResponse: ErrorFixResponse,
    errorContext: CompilationErrorContext,
  ): Promise<number> {
    let operationsApplied = 0;

    try {
      for (const operation of fixResponse.operations) {
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
                  `${operation.type}: ${operation.file.path} - ${operation.file.reason}`,
                );
                operationsApplied++;
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
                    `DELETE: ${operation.file.path} - ${operation.file.reason}`,
                  );
                  operationsApplied++;
                }
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
                    `RENAME: ${operation.file.oldPath} -> ${operation.file.newPath} - ${operation.file.reason}`,
                  );
                  operationsApplied++;
                }
              }
              break;

            default:
              console.warn(`Unknown operation type: ${operation.type}`);
          }
        } catch (opError) {
          console.error(
            `Failed to apply operation ${operation.type}:`,
            opError,
          );
        }
      }

      // Update project-info.json with fix information
      const projectInfoPath = path.join(
        errorContext.projectPath,
        'project-info.json',
      );
      if (await fs.pathExists(projectInfoPath)) {
        try {
          const projectInfo = JSON.parse(
            await fs.readFile(projectInfoPath, 'utf8'),
          );
          projectInfo.lastFixAttempt = {
            timestamp: new Date().toISOString(),
            fixDescription: fixResponse.fixDescription,
            operationsApplied: operationsApplied,
            expectedOutcome: fixResponse.expectedOutcome,
          };
          await fs.writeFile(
            projectInfoPath,
            JSON.stringify(projectInfo, null, 2),
            'utf8',
          );
        } catch (error) {
          console.warn('Could not update project-info.json:', error.message);
        }
      }
    } catch (error) {
      console.error('Error applying fix operations:', error);
    }
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
      await fs.ensureDir(projectPath);

      // Write all the files from the plugin project
      for (const file of pluginProject.files) {
        const filePath = path.join(projectPath, file.path);

        // Ensure the directory exists for this file
        await fs.ensureDir(path.dirname(filePath));

        // Write the file content
        await fs.writeFile(filePath, file.content, 'utf8');
      }

      // Update the project summary file
      const projectSummary = {
        ...pluginProject,
        generatedAt: new Date().toISOString(),
        userId,
        lastFixed: new Date().toISOString(),
      };

      const summaryPath = path.join(projectPath, 'project-info.json');
      await fs.writeFile(
        summaryPath,
        JSON.stringify(projectSummary, null, 2),
        'utf8',
      );
    } catch (error) {
      throw new Error(`Failed to write project to disk: ${error.message}`);
    }
  }
}
