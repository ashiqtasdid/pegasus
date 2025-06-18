import { Injectable } from '@nestjs/common';
import {
  OpenRouterClient,
  OpenRouterMessage,
  OpenRouterRequest,
  OpenRouterResponse,
} from './openrouter.client';
import {
  AIPromptTemplates,
  PluginProject,
  PluginFile,
} from './ai-prompt-templates.service';

// Re-export types for backward compatibility
export { PluginProject, PluginFile } from './ai-prompt-templates.service';

/**
 * AI Service - Modular service for Minecraft plugin generation using AI
 *
 * This service has been refactored to be modular and maintainable:
 * - Uses OpenRouterClient for all API communication
 * - Uses AIPromptTemplates for prompt management and fallback projects
 * - Focuses on core AI orchestration and JSON parsing logic
 * - Robust error handling and multi-strategy parsing
 */
@Injectable()
export class AiService {
  constructor(
    private openRouterClient: OpenRouterClient,
    private promptTemplates: AIPromptTemplates,
  ) {}

  // AI Model Configuration with optimized settings for accuracy
  private get modelConfigs() {
    return this.promptTemplates.getModelConfigurations();
  }

  private get codeGenerationModel() {
    return this.modelConfigs.codeGeneration.model;
  }

  private get promptEnhancementModel() {
    return this.modelConfigs.promptEnhancement.model;
  }
  /**
   * Generate plugin code using AI with robust parsing and fallback
   */
  async generatePluginCode(
    prompt: string,
    pluginName: string,
    complexity: number = 5,
  ): Promise<PluginProject> {
    console.log(
      `🤖 AI Service: Starting plugin generation for "${pluginName}" (complexity: ${complexity}/10)`,
    );
    console.log(`🎯 AI Service: Using Claude Sonnet 4 for code generation`);
    console.log(`📝 AI Service: User prompt: "${prompt}"`);

    // Validate inputs
    const validation = this.promptTemplates.validatePromptParameters(
      pluginName,
      prompt,
    );
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.promptTemplates.getPluginGenerationSystemPrompt(),
      },
      {
        role: 'user',
        content: this.promptTemplates.getPluginGenerationUserPrompt(
          pluginName,
          prompt,
        ),
      },
    ];
    console.log(
      `🌐 AI Service: Calling OpenRouter API with Claude Sonnet 4 for code generation`,
    );
    const codeGenConfig = this.modelConfigs.codeGeneration;

    // Calculate max tokens based on complexity
    const maxTokens = this.calculateTokensForComplexity(
      complexity,
      'codeGeneration',
    );
    console.log(
      `🎯 AI Service: Using ${maxTokens} max tokens for complexity ${complexity}/10`,
    );

    const response = await this.openRouterClient.chatCompletion({
      model: codeGenConfig.model,
      messages,
      max_tokens: maxTokens,
      temperature: codeGenConfig.temperature,
      top_p: codeGenConfig.top_p,
    });

    console.log(
      `✅ AI Service: Received response from OpenRouter (${response.usage?.total_tokens || 'unknown'} tokens)`,
    );

    const aiResponse = response.choices[0]?.message?.content || '';
    console.log(
      `📦 AI Service: Response length: ${aiResponse.length} characters`,
    );

    try {
      // Try to parse the JSON response with comprehensive error handling
      console.log(`🔍 AI Service: Parsing JSON response...`);

      const parsedProject = await this.parseAIResponseToProject(
        aiResponse,
        pluginName,
        prompt,
      );
      console.log(`🎉 AI Service: Plugin generation completed successfully`);
      return parsedProject;
    } catch (parseError) {
      console.log(`⚠️ AI Service: JSON parsing failed: ${parseError.message}`);
      console.log(`🔄 AI Service: Creating fallback project structure`);
      // Fallback: create a basic structure if JSON parsing fails
      const fallbackProject = this.promptTemplates.getFallbackProjectTemplate(
        pluginName,
        prompt,
      );
      console.log(
        `✅ AI Service: Fallback project created with ${fallbackProject.files.length} files`,
      );
      return fallbackProject;
    }
  }

  /**
   * Enhance user prompt with AI to make it more detailed and technical
   */
  async enhancePrompt(
    originalPrompt: string,
    complexity: number = 5,
  ): Promise<string> {
    console.log(
      `🔧 AI Service: Enhancing prompt - original length: ${originalPrompt.length} characters`,
    );
    console.log(
      `🎯 AI Service: Using Gemini Flash 1.5 for prompt enhancement (complexity: ${complexity}/10)`,
    );

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.promptTemplates.getPromptEnhancementSystemPrompt(),
      },
      {
        role: 'user',
        content: this.promptTemplates.getPromptEnhancementUserPrompt(
          originalPrompt,
          complexity,
        ),
      },
    ];
    console.log(
      `🌐 AI Service: Calling OpenRouter API for prompt enhancement with Gemini Flash 1.5`,
    );

    // Calculate max tokens based on complexity for prompt enhancement
    const maxTokens = this.calculateTokensForComplexity(
      complexity,
      'promptEnhancement',
    );
    console.log(
      `🎯 AI Service: Using ${maxTokens} max tokens for prompt enhancement (complexity ${complexity}/10)`,
    );

    const response = await this.openRouterClient.chatCompletion({
      model: 'google/gemini-flash-1.5', // Changed to Gemini Flash 1.5 as requested
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      top_p: 0.95,
    });

    const enhancedPrompt =
      response.choices[0]?.message?.content || originalPrompt;
    console.log(
      `✅ AI Service: Prompt enhanced - new length: ${enhancedPrompt.length} characters`,
    );
    console.log(
      `📈 AI Service: Enhancement ratio: ${(enhancedPrompt.length / originalPrompt.length).toFixed(2)}x`,
    );

    return enhancedPrompt;
  }

  /**
   * Calculate optimal token count based on complexity level (1-10)
   */
  private calculateTokensForComplexity(
    complexity: number,
    operation:
      | 'codeGeneration'
      | 'promptEnhancement'
      | 'errorFix'
      | 'validation',
  ): number {
    // Ensure complexity is within valid range
    const validComplexity = Math.max(1, Math.min(10, complexity));
    const baseTokens = {
      codeGeneration: {
        min: 4000, // Simple plugins (basic commands, simple functionality) - Updated to start from 4K
        max: 12000, // Very complex plugins (multiple systems, databases, GUIs) - Max remains 12K
      },
      promptEnhancement: {
        min: 2000, // Basic enhancement
        max: 8000, // Complex detailed enhancement
      },
      errorFix: {
        min: 4000, // Simple fixes
        max: 16000, // Complex debugging
      },
      validation: {
        min: 1000, // Basic validation
        max: 4000, // Comprehensive validation
      },
    };

    const config = baseTokens[operation];
    const range = config.max - config.min;
    const complexityFactor = (validComplexity - 1) / 9; // Convert 1-10 to 0-1

    const calculatedTokens = Math.round(config.min + range * complexityFactor);

    console.log(
      `🧮 AI Service: Complexity ${validComplexity}/10 → ${calculatedTokens} tokens for ${operation}`,
    );
    return calculatedTokens;
  }

  /**
   * Robust JSON parsing method that handles various edge cases and malformed responses
   */
  private async parseAIResponseToProject(
    aiResponse: string,
    pluginName: string,
    prompt: string,
  ): Promise<PluginProject> {
    console.log(
      `🔍 AI Service: Starting robust JSON parsing (${aiResponse.length} chars)`,
    );

    // Step 1: Pre-validation checks
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty AI response received');
    }

    // Step 2: Clean the response string
    let jsonString = this.cleanAIResponse(aiResponse);
    console.log(`🧹 AI Service: Cleaned response (${jsonString.length} chars)`);

    // Step 3: Validate basic JSON structure
    if (!this.isValidJSONStructure(jsonString)) {
      console.log(
        `⚠️ AI Service: Invalid JSON structure detected, attempting extraction`,
      );
      jsonString = this.extractJSONFromResponse(jsonString);
    }

    // Step 4: Try multiple parsing strategies with enhanced validation
    const parsingStrategies = [
      () => this.parseDirectJSON(jsonString),
      () => this.parseWithRegexExtraction(jsonString),
      () => this.parseWithFallbackCleaning(jsonString),
      () => this.parseWithBracketMatching(jsonString),
      () => this.parseWithAdvancedCleaning(jsonString),
    ];

    for (let i = 0; i < parsingStrategies.length; i++) {
      try {
        console.log(`🔍 AI Service: Trying parsing strategy ${i + 1}...`);
        const result = parsingStrategies[i]();
        if (result) {
          // Enhanced validation before accepting result
          const validationResult = this.validateJSONStructure(result);
          if (validationResult.isValid) {
            const validatedProject = this.validateAndSanitizeProject(
              result,
              pluginName,
              prompt,
            );
            console.log(
              `✅ AI Service: Successfully parsed with strategy ${i + 1}`,
            );
            return validatedProject;
          } else {
            console.log(
              `⚠️ AI Service: Strategy ${i + 1} parsed but failed validation: ${validationResult.errors.join(', ')}`,
            );
            continue;
          }
        }
      } catch (error) {
        console.log(
          `⚠️ AI Service: Strategy ${i + 1} failed: ${error.message}`,
        );
        continue;
      }
    }

    throw new Error(
      'All JSON parsing strategies failed with enhanced validation',
    );
  }

  /**
   * Clean and normalize the AI response string
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

    // Fix common escape sequence issues
    cleaned = cleaned
      .replace(/\\n/g, '\\n')
      .replace(/\\"/g, '\\"')
      .replace(/\\'/g, "\\'")
      .replace(/\\\\/g, '\\\\');

    return cleaned;
  }

  /**
   * Direct JSON parsing attempt
   */
  private parseDirectJSON(jsonString: string): PluginProject | null {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse using regex to extract JSON object
   */
  private parseWithRegexExtraction(input: string): PluginProject | null {
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
  private parseWithFallbackCleaning(input: string): PluginProject | null {
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
  private parseWithBracketMatching(input: string): PluginProject | null {
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
   * Advanced cleaning for complex malformed JSON
   */
  private parseWithAdvancedCleaning(input: string): PluginProject | null {
    try {
      let cleaned = input;

      // Advanced JSON repair strategies
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
      cleaned = cleaned.replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys
      cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single quotes with double quotes
      cleaned = cleaned.replace(/\\n/g, '\\\\n'); // Fix newline escaping
      cleaned = cleaned.replace(/\\"/g, '\\\\"'); // Fix quote escaping
      cleaned = cleaned.replace(/\n/g, '\\n'); // Escape actual newlines
      cleaned = cleaned.replace(/\r/g, ''); // Remove carriage returns
      cleaned = cleaned.replace(/\t/g, '\\t'); // Escape tabs

      // Fix common content escaping issues
      cleaned = cleaned.replace(
        /"content":\s*"([^"]*(?:\\"[^"]*)*)"(?=\s*,|\s*})/g,
        (match, content) => {
          // Re-escape content that might have unescaped quotes
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
    // Find the first { and last } to extract JSON block
    const firstBrace = input.indexOf('{');
    const lastBrace = input.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return input.substring(firstBrace, lastBrace + 1);
    }

    return input;
  }

  /**
   * Comprehensive JSON structure validation
   */
  private validateJSONStructure(obj: any): {
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
      'projectName',
      'minecraftVersion',
      'files',
      'dependencies',
      'buildInstructions',
    ];
    for (const field of requiredFields) {
      if (!(field in obj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate projectName
    if (
      obj.projectName &&
      (typeof obj.projectName !== 'string' ||
        obj.projectName.trim().length === 0)
    ) {
      errors.push('projectName must be a non-empty string');
    }

    // Validate minecraftVersion
    if (
      obj.minecraftVersion &&
      (typeof obj.minecraftVersion !== 'string' ||
        !obj.minecraftVersion.match(/^\d+\.\d+(\.\d+)?$/))
    ) {
      errors.push(
        'minecraftVersion must be a valid version string (e.g., 1.20.1)',
      );
    }

    // Validate files array
    if (obj.files) {
      if (!Array.isArray(obj.files)) {
        errors.push('files must be an array');
      } else if (obj.files.length === 0) {
        errors.push('files array cannot be empty');
      } else {
        obj.files.forEach((file: any, index: number) => {
          if (!file || typeof file !== 'object') {
            errors.push(`File ${index} is not an object`);
            return;
          }

          if (
            !file.path ||
            typeof file.path !== 'string' ||
            file.path.trim().length === 0
          ) {
            errors.push(`File ${index} missing or invalid path`);
          }

          if (!file.content || typeof file.content !== 'string') {
            errors.push(`File ${index} missing or invalid content`);
          }

          if (
            !file.type ||
            typeof file.type !== 'string' ||
            file.type.trim().length === 0
          ) {
            errors.push(`File ${index} missing or invalid type`);
          }

          // Validate file path format
          if (
            file.path &&
            (file.path.includes('..') ||
              file.path.startsWith('/') ||
              file.path.includes('\\'))
          ) {
            errors.push(`File ${index} has invalid path format: ${file.path}`);
          }
        });
      }
    }

    // Validate dependencies
    if (obj.dependencies && !Array.isArray(obj.dependencies)) {
      errors.push('dependencies must be an array');
    }

    // Validate buildInstructions
    if (
      obj.buildInstructions &&
      (typeof obj.buildInstructions !== 'string' ||
        obj.buildInstructions.trim().length === 0)
    ) {
      errors.push('buildInstructions must be a non-empty string');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate and sanitize the parsed project structure
   */
  private validateAndSanitizeProject(
    project: any,
    pluginName: string,
    prompt: string,
  ): PluginProject {
    // Ensure required fields exist
    const sanitized: PluginProject = {
      projectName: this.validateString(project.projectName, pluginName),
      minecraftVersion: this.validateString(project.minecraftVersion, '1.20.1'),
      files: this.validateFiles(project.files, pluginName, prompt),
      dependencies: this.validateArray(project.dependencies, [
        'org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT',
      ]),
      buildInstructions: this.validateString(
        project.buildInstructions,
        'mvn clean compile package',
      ),
    };

    // Ensure we have at least basic required files
    this.ensureRequiredFiles(sanitized, pluginName, prompt);

    console.log(
      `📁 AI Service: Validated project with ${sanitized.files.length} files`,
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
   * Validate and sanitize files array
   */
  private validateFiles(
    files: any,
    pluginName: string,
    prompt: string,
  ): PluginFile[] {
    if (!Array.isArray(files)) {
      console.log(
        `⚠️ AI Service: Files is not an array, creating minimal structure`,
      );
      return this.createMinimalFileStructure(pluginName, prompt);
    }

    const validFiles: PluginFile[] = [];

    for (const file of files) {
      try {
        if (this.isValidFile(file)) {
          validFiles.push({
            path: file.path.trim(),
            content: this.sanitizeFileContent(file.content),
            type: file.type
              ? file.type.trim()
              : this.getFileTypeFromPath(file.path),
          });
        } else {
          console.log(`⚠️ AI Service: Skipping invalid file:`, file);
        }
      } catch (error) {
        console.log(`⚠️ AI Service: Error processing file: ${error.message}`);
      }
    }

    return validFiles.length > 0
      ? validFiles
      : this.createMinimalFileStructure(pluginName, prompt);
  }

  /**
   * Check if a file object is valid
   */
  private isValidFile(file: any): boolean {
    return (
      file &&
      typeof file.path === 'string' &&
      file.path.trim().length > 0 &&
      typeof file.content === 'string'
    );
  }

  /**
   * Sanitize file content to prevent issues
   */
  private sanitizeFileContent(content: string): string {
    if (typeof content !== 'string') {
      return '';
    }

    // Ensure content is properly handled
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Get file type from file path
   */
  private getFileTypeFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext || 'txt';
  }

  /**
   * Create minimal file structure as fallback
   */
  private createMinimalFileStructure(
    pluginName: string,
    prompt: string,
  ): PluginFile[] {
    return this.promptTemplates.getFallbackProjectTemplate(pluginName, prompt)
      .files;
  }

  /**
   * Ensure required files exist in the project
   */
  private ensureRequiredFiles(
    project: PluginProject,
    pluginName: string,
    prompt: string,
  ): void {
    const requiredFiles = ['plugin.yml', '.java', 'pom.xml'];
    const existingTypes = new Set(
      project.files.map((f) => {
        if (f.path.includes('plugin.yml')) return 'plugin.yml';
        if (f.path.endsWith('.java')) return '.java';
        if (f.path.includes('pom.xml')) return 'pom.xml';
        return f.type;
      }),
    );

    const missingFiles = requiredFiles.filter(
      (type) => !existingTypes.has(type),
    );

    if (missingFiles.length > 0) {
      console.log(
        `⚠️ AI Service: Adding missing required files: ${missingFiles.join(', ')}`,
      );
      const minimal = this.promptTemplates.getFallbackProjectTemplate(
        pluginName,
        prompt,
      );

      for (const file of minimal.files) {
        if (
          missingFiles.some(
            (missing) =>
              file.path.includes(missing) || file.path.endsWith(missing),
          )
        ) {
          project.files.push(file);
        }
      }
    }
  }

  /**
   * Generate plugin code with enhanced accuracy through multi-stage validation
   */
  async generatePluginCodeWithValidation(
    prompt: string,
    pluginName: string,
  ): Promise<PluginProject> {
    console.log(
      `🎯 AI Service: Starting enhanced plugin generation with validation for "${pluginName}"`,
    );

    // Stage 1: Validate and enhance the prompt
    const validation = this.promptTemplates.validatePromptParameters(
      pluginName,
      prompt,
    );
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Stage 2: Enhanced prompt processing
    console.log(`🔧 AI Service: Enhancing prompt for better accuracy`);
    const enhancedPrompt = await this.enhancePrompt(prompt);

    // Stage 3: Generate with enhanced prompt
    console.log(
      `🤖 AI Service: Generating plugin with enhanced specifications`,
    );
    let project = await this.generatePluginCode(enhancedPrompt, pluginName);

    // Stage 4: Validate generated project
    console.log(`✅ AI Service: Validating generated project`);
    const projectValidation = await this.validateGeneratedProject(
      project,
      pluginName,
      enhancedPrompt,
    );

    if (!projectValidation.isValid) {
      console.log(`⚠️ AI Service: Project validation failed, attempting fixes`);
      project = await this.fixProjectIssues(
        project,
        projectValidation.issues,
        pluginName,
        enhancedPrompt,
      );
    }

    console.log(
      `🎉 AI Service: Enhanced plugin generation completed successfully`,
    );
    return project;
  }

  /**
   * Validate generated project for common issues and completeness
   */
  private async validateGeneratedProject(
    project: PluginProject,
    pluginName: string,
    prompt: string,
  ): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    console.log(`🔍 AI Service: Performing comprehensive project validation`);

    // Validate project structure
    if (!project.files || project.files.length < 4) {
      issues.push(
        'Project missing required files (minimum: main class, plugin.yml, pom.xml, README.md)',
      );
    }

    // Validate main Java file
    const javaFiles = project.files.filter(
      (f) => f.type === 'java' && f.path.includes('Plugin.java'),
    );
    if (javaFiles.length === 0) {
      issues.push('No main plugin class found');
    } else {
      const mainClass = javaFiles[0];
      if (!mainClass.content.includes('extends JavaPlugin')) {
        issues.push('Main class does not extend JavaPlugin');
      }
      if (!mainClass.content.includes('onEnable()')) {
        issues.push('Main class missing onEnable() method');
      }
      if (!mainClass.content.includes('onDisable()')) {
        issues.push('Main class missing onDisable() method');
      }
      if (
        mainClass.content.includes('TODO') ||
        mainClass.content.includes('FIXME')
      ) {
        issues.push('Main class contains placeholder text');
      }
    }

    // Validate plugin.yml
    const pluginYml = project.files.find((f) => f.path.includes('plugin.yml'));
    if (!pluginYml) {
      issues.push('plugin.yml file missing');
    } else {
      if (!pluginYml.content.includes('name:')) {
        issues.push('plugin.yml missing name field');
      }
      if (!pluginYml.content.includes('main:')) {
        issues.push('plugin.yml missing main class field');
      }
      if (!pluginYml.content.includes('version:')) {
        issues.push('plugin.yml missing version field');
      }
      if (!pluginYml.content.includes('api-version:')) {
        suggestions.push('Consider adding api-version field to plugin.yml');
      }
    }

    // Validate pom.xml
    const pomXml = project.files.find((f) => f.path.includes('pom.xml'));
    if (!pomXml) {
      issues.push('pom.xml file missing');
    } else {
      if (!pomXml.content.includes('spigot-api')) {
        issues.push('pom.xml missing Spigot API dependency');
      }
      if (!pomXml.content.includes('maven-compiler-plugin')) {
        suggestions.push('Consider adding Maven compiler plugin to pom.xml');
      }
    }

    // Validate content quality
    const allContent = project.files.map((f) => f.content).join('\n');
    if (
      allContent.includes('TODO') ||
      allContent.includes('FIXME') ||
      allContent.includes('PLACEHOLDER')
    ) {
      issues.push('Generated code contains placeholder text');
    }

    // Check for prompt requirement fulfillment
    if (
      prompt.toLowerCase().includes('command') &&
      !allContent.toLowerCase().includes('oncommand')
    ) {
      issues.push(
        'Plugin requirements mention commands but no command handling found',
      );
    }

    if (
      prompt.toLowerCase().includes('event') &&
      !allContent.toLowerCase().includes('event')
    ) {
      issues.push(
        'Plugin requirements mention events but no event handling found',
      );
    }

    const isValid = issues.length === 0;
    console.log(
      `📊 AI Service: Validation complete - ${isValid ? 'PASSED' : 'FAILED'} (${issues.length} issues, ${suggestions.length} suggestions)`,
    );

    return { isValid, issues, suggestions };
  }

  /**
   * Attempt to fix common project issues
   */
  private async fixProjectIssues(
    project: PluginProject,
    issues: string[],
    pluginName: string,
    prompt: string,
  ): Promise<PluginProject> {
    console.log(
      `🔧 AI Service: Attempting to fix ${issues.length} project issues`,
    );

    // If critical issues exist, regenerate with more specific prompts
    const criticalIssues = issues.filter(
      (issue) =>
        issue.includes('missing') ||
        issue.includes('extends JavaPlugin') ||
        issue.includes('placeholder'),
    );

    if (criticalIssues.length > 0) {
      console.log(
        `⚠️ AI Service: Critical issues found, using fallback generation`,
      );
      const fallbackProject = this.promptTemplates.getFallbackProjectTemplate(
        pluginName,
        prompt,
      );

      // Merge non-critical files from original generation
      const mergedFiles = [...fallbackProject.files];
      project.files.forEach((file) => {
        if (!file.content.includes('TODO') && !file.content.includes('FIXME')) {
          const existingIndex = mergedFiles.findIndex(
            (f) => f.path === file.path,
          );
          if (existingIndex >= 0) {
            mergedFiles[existingIndex] = file;
          } else {
            mergedFiles.push(file);
          }
        }
      });

      return {
        ...fallbackProject,
        files: mergedFiles,
      };
    }

    return project;
  }
}
