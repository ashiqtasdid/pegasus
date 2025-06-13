import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService, PluginProject, OpenRouterMessage, OpenRouterRequest, OpenRouterResponse } from './ai.service';
import { DiskReaderService, DiskProjectInfo } from './disk-reader.service';
import { MavenService, CompilationResult } from './maven.service';
import axios, { AxiosResponse } from 'axios';
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
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly apiKey: string;
  private readonly siteUrl: string;
  private readonly siteName: string;
  
  // AI Model Configuration - Same as AI Service
  private readonly errorFixModel = 'anthropic/claude-sonnet-4'; // Claude Sonnet 4 for error analysis and fixes

  constructor(
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly diskReaderService: DiskReaderService,
    private readonly mavenService: MavenService,
  ) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.siteUrl = this.configService.get<string>('YOUR_SITE_URL', 'http://localhost:3000');
    this.siteName = this.configService.get<string>('YOUR_SITE_NAME', 'Pegasus Plugin Generator');

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured in environment variables');
    }
  }

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
  }  private async generateErrorFix(
    errorContext: CompilationErrorContext,
  ): Promise<ErrorFixResponse | null> {
    console.log(`🤖 Error Fix Service: Starting error analysis for "${errorContext.pluginName}"`);
    console.log(`🎯 Error Fix Service: Using Claude Sonnet 4 for error analysis and fixes`);
    
    try {
      const fixPrompt = this.buildErrorFixPrompt(errorContext);
      console.log(`📝 Error Fix Service: Built error fix prompt: ${fixPrompt.length} characters`);

      const messages: OpenRouterMessage[] = [
        {
          role: 'system',
          content: `You are a Minecraft plugin compilation error fixing expert. You MUST respond with ONLY a valid JSON object. No explanations, no markdown code blocks, no text outside the JSON structure.

RESPOND WITH ONLY RAW JSON (DO NOT use code block markdown formatting):
{
  "fixDescription": "string (brief description of what compilation errors were fixed)",
  "operations": [
    {
      "type": "UPDATE" | "CREATE" | "DELETE" | "RENAME",
      "file": {
        "path": "string (relative file path from project root)",
        "oldPath": "string (for RENAME operations)",
        "newPath": "string (for RENAME operations)",
        "content": "string (complete updated file content with proper escaping)",
        "reason": "string (specific compilation error being fixed)"
      }
    }
  ],
  "buildCommands": ["array of build command strings"],
  "expectedOutcome": "string (expected compilation outcome)"
}

CRITICAL RULES FOR ERROR FIXING:
- PRESERVE existing functionality and complex logic wherever possible
- ONLY fix actual compilation errors, don't simplify working code
- Fix imports, syntax errors, missing dependencies, incorrect API usage
- DO NOT replace complex implementations with simple ones
- Maintain the original plugin structure and features
- Include complete file content for UPDATE/CREATE operations
- Focus on minimal changes that resolve compilation issues
- Escape all special characters properly in JSON (newlines as \\n, quotes as \\")
- NO markdown formatting, NO code blocks, ONLY raw JSON
- Ensure all strings are properly escaped for JSON format
- DO NOT include any explanations, comments, or additional text outside the JSON structure`
        },
        {
          role: 'user',
          content: fixPrompt
        }
      ];

      console.log(`🌐 Error Fix Service: Calling OpenRouter API with Claude Sonnet 4 for error analysis`);
      const response = await this.callOpenRouter({
        model: this.errorFixModel,
        messages,
        temperature: 0.1,
        max_tokens: 12000, // Allow large responses for complex fixes
      });

      console.log(`✅ Error Fix Service: Received response from OpenRouter (${response.usage?.total_tokens || 'unknown'} tokens)`);

      const aiResponse = response.choices[0]?.message?.content || '';
      console.log(`� Error Fix Service: Response length: ${aiResponse.length} characters`);

      try {
        // Parse the JSON response using the same logic as AI service
        console.log(`🔍 Error Fix Service: Parsing JSON response...`);
        
        let jsonString = aiResponse.trim();
        
        // Remove markdown code blocks if present
        if (jsonString.startsWith('```json')) {
          console.log(`🧹 Error Fix Service: Removing markdown json code block wrapper`);
          jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonString.startsWith('```')) {
          console.log(`🧹 Error Fix Service: Removing markdown code block wrapper`);
          jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        // Try to extract JSON object
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.log(`❌ Error Fix Service: No JSON found in AI response`);
          throw new Error('No JSON found in AI response');
        }
        
        console.log(`🔍 Error Fix Service: Attempting to parse ${jsonMatch[0].length} character JSON string`);
        const fixResponse: ErrorFixResponse = JSON.parse(jsonMatch[0]);
        console.log(`✅ Error Fix Service: Successfully parsed JSON fix response`);
        console.log(`🔧 Error Fix Service: Generated ${fixResponse.operations?.length || 0} operations for error fixing`);
        
        // Validate the response structure
        if (!fixResponse.operations || !Array.isArray(fixResponse.operations)) {
          console.log(`❌ Error Fix Service: Invalid fix response structure`);
          throw new Error('Invalid fix response: missing or invalid operations array');
        }
        
        console.log(`🎉 Error Fix Service: Error analysis completed successfully`);
        return fixResponse;
      } catch (parseError) {
        console.log(`⚠️ Error Fix Service: JSON parsing failed: ${parseError.message}`);
        console.log(`📄 Error Fix Service: Raw response preview (first 500 chars): ${aiResponse.substring(0, 500)}`);
        console.log(`📄 Error Fix Service: Raw response preview (last 100 chars): ${aiResponse.substring(Math.max(0, aiResponse.length - 100))}`);
        return null;
      }
    } catch (error) {      console.error(`❌ Error Fix Service: Error generating fix: ${error.message}`);
      return null;
    }
  }

  private async callOpenRouter(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const startTime = Date.now();
    console.log(`� Error Fix Service: Making HTTP request to OpenRouter API`);
    console.log(`📊 Error Fix Service: Request model: ${request.model}, temperature: ${request.temperature}, max_tokens: ${request.max_tokens}`);
    
    try {
      const response: AxiosResponse<OpenRouterResponse> = await axios.post(
        `${this.baseUrl}/chat/completions`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.siteName,
          },
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ Error Fix Service: OpenRouter API call completed in ${duration}ms`);
      console.log(`📊 Error Fix Service: Token usage - prompt: ${response.data.usage?.prompt_tokens}, completion: ${response.data.usage?.completion_tokens}, total: ${response.data.usage?.total_tokens}`);

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;      console.error(`❌ Error Fix Service: OpenRouter API call failed after ${duration}ms`);
      
      if (axios.isAxiosError(error)) {
        console.error(`❌ Error Fix Service: HTTP ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`);
        throw new Error(`OpenRouter API error: ${error.response?.data?.error?.message || error.message}`);
      }
      console.error(`❌ Error Fix Service: Unexpected error: ${error.message}`);
      throw new Error(`Failed to call OpenRouter API: ${error.message}`);
    }
  }
  private buildErrorFixPrompt(errorContext: CompilationErrorContext): string {
    console.log(`🔧 Error Fix Service: Building error fix prompt for "${errorContext.pluginName}"`);
    const { compilationLogs, currentProject, pluginName } = errorContext;

    // Create a complete project snapshot as JSON
    console.log(`📁 Error Fix Service: Creating project snapshot with ${currentProject.files.length} files`);
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

    console.log(`✅ Error Fix Service: Built error fix prompt (${prompt.length} characters)`);
    return prompt;
  }
  private async applyFixOperations(
    fixResponse: ErrorFixResponse,
    errorContext: CompilationErrorContext,
  ): Promise<number> {
    console.log(`🔧 Error Fix Service: Applying ${fixResponse.operations.length} fix operations`);
    console.log(`📝 Error Fix Service: Fix description: ${fixResponse.fixDescription}`);
    
    let operationsApplied = 0;

    try {
      for (const operation of fixResponse.operations) {
        console.log(`🔄 Error Fix Service: Processing ${operation.type} operation for ${operation.file.path || operation.file.oldPath || 'unknown'}`);
        
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
                console.warn(`⚠️ Skipping ${operation.type} operation: missing path or content`);
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
                  console.warn(`⚠️ File not found for deletion: ${operation.file.path}`);
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
                  console.warn(`⚠️ Source file not found for rename: ${operation.file.oldPath}`);
                }
              } else {
                console.warn(`⚠️ Skipping RENAME operation: missing oldPath or newPath`);
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
        }      }

      console.log(`📊 Error Fix Service: Successfully applied ${operationsApplied} of ${fixResponse.operations.length} operations`);

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
          console.log(`📄 Error Fix Service: Updated project-info.json with fix details`);
        } catch (error) {
          console.warn(`⚠️ Error Fix Service: Could not update project-info.json: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error Fix Service: Error applying fix operations: ${error.message}`);
    }
    
    console.log(`🎯 Error Fix Service: Completed operation application - ${operationsApplied} operations applied`);
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
