import { Injectable } from '@nestjs/common';
import { OpenRouterClient, OpenRouterMessage, OpenRouterRequest, OpenRouterResponse } from './openrouter.client';
import { AIPromptTemplates, PluginProject, PluginFile } from './ai-prompt-templates.service';

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
  // AI Model Configuration
  // - Claude Sonnet 4: Used for complex code generation and fixes
  // - Gemini Flash 1.5: Used for basic tasks like prompt enhancement
  private readonly codeGenerationModel = 'anthropic/claude-sonnet-4';
  private readonly promptEnhancementModel = 'google/gemini-flash-1.5';
  
  constructor(
    private openRouterClient: OpenRouterClient,
    private promptTemplates: AIPromptTemplates
  ) {}

  /**
   * Generate plugin code using AI with robust parsing and fallback
   */
  async generatePluginCode(prompt: string, pluginName: string): Promise<PluginProject> {
    console.log(`🤖 AI Service: Starting plugin generation for "${pluginName}"`);
    console.log(`🎯 AI Service: Using Claude Sonnet 4 for code generation`);
    console.log(`📝 AI Service: User prompt: "${prompt}"`);
    
    // Validate inputs
    const validation = this.promptTemplates.validatePromptParameters(pluginName, prompt);
    if (!validation.isValid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }
    
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.promptTemplates.getPluginGenerationSystemPrompt()
      },
      {
        role: 'user',
        content: this.promptTemplates.getPluginGenerationUserPrompt(pluginName, prompt)
      }
    ];
    
    console.log(`🌐 AI Service: Calling OpenRouter API with Claude Sonnet 4 for code generation`);
    const response = await this.openRouterClient.chatCompletion({
      model: this.codeGenerationModel,
      messages,
      max_tokens: 12000, // Allow large responses for complex plugins
    });
    
    console.log(`✅ AI Service: Received response from OpenRouter (${response.usage?.total_tokens || 'unknown'} tokens)`);

    const aiResponse = response.choices[0]?.message?.content || '';
    console.log(`📦 AI Service: Response length: ${aiResponse.length} characters`);
    
    try {
      // Try to parse the JSON response with comprehensive error handling
      console.log(`🔍 AI Service: Parsing JSON response...`);
      
      const parsedProject = await this.parseAIResponseToProject(aiResponse, pluginName, prompt);
      console.log(`🎉 AI Service: Plugin generation completed successfully`);
      return parsedProject;
    } catch (parseError) {
      console.log(`⚠️ AI Service: JSON parsing failed: ${parseError.message}`);
      console.log(`🔄 AI Service: Creating fallback project structure`);
      // Fallback: create a basic structure if JSON parsing fails
      const fallbackProject = this.promptTemplates.getFallbackProjectTemplate(pluginName, prompt);
      console.log(`✅ AI Service: Fallback project created with ${fallbackProject.files.length} files`);
      return fallbackProject;
    }
  }

  /**
   * Enhance user prompt with AI to make it more detailed and technical
   */
  async enhancePrompt(originalPrompt: string): Promise<string> {
    console.log(`🔧 AI Service: Enhancing prompt - original length: ${originalPrompt.length} characters`);
    console.log(`🎯 AI Service: Using Gemini Flash 1.5 for prompt enhancement`);
    
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.promptTemplates.getPromptEnhancementSystemPrompt()
      },
      {
        role: 'user',
        content: this.promptTemplates.getPromptEnhancementUserPrompt(originalPrompt)
      }
    ];
    
    console.log(`🌐 AI Service: Calling OpenRouter API for prompt enhancement with Gemini Flash 1.5`);
    const response = await this.openRouterClient.chatCompletion({
      model: this.promptEnhancementModel,
      messages,
      temperature: 0.5
    });

    const enhancedPrompt = response.choices[0]?.message?.content || originalPrompt;
    console.log(`✅ AI Service: Prompt enhanced - new length: ${enhancedPrompt.length} characters`);
    console.log(`📈 AI Service: Enhancement ratio: ${(enhancedPrompt.length / originalPrompt.length).toFixed(2)}x`);

    return enhancedPrompt;
  }

  /**
   * Robust JSON parsing method that handles various edge cases and malformed responses
   */
  private async parseAIResponseToProject(aiResponse: string, pluginName: string, prompt: string): Promise<PluginProject> {
    console.log(`🔍 AI Service: Starting robust JSON parsing (${aiResponse.length} chars)`);
    
    // Step 1: Pre-validation checks
    if (!aiResponse || aiResponse.trim().length === 0) {
      throw new Error('Empty AI response received');
    }
    
    // Step 2: Clean the response string
    let jsonString = this.cleanAIResponse(aiResponse);
    console.log(`🧹 AI Service: Cleaned response (${jsonString.length} chars)`);
    
    // Step 3: Validate basic JSON structure
    if (!this.isValidJSONStructure(jsonString)) {
      console.log(`⚠️ AI Service: Invalid JSON structure detected, attempting extraction`);
      jsonString = this.extractJSONFromResponse(jsonString);
    }
    
    // Step 4: Try multiple parsing strategies with enhanced validation
    const parsingStrategies = [
      () => this.parseDirectJSON(jsonString),
      () => this.parseWithRegexExtraction(jsonString),
      () => this.parseWithFallbackCleaning(jsonString),
      () => this.parseWithBracketMatching(jsonString),
      () => this.parseWithAdvancedCleaning(jsonString)
    ];
    
    for (let i = 0; i < parsingStrategies.length; i++) {
      try {
        console.log(`🔍 AI Service: Trying parsing strategy ${i + 1}...`);
        const result = parsingStrategies[i]();
        if (result) {
          // Enhanced validation before accepting result
          const validationResult = this.validateJSONStructure(result);
          if (validationResult.isValid) {
            const validatedProject = this.validateAndSanitizeProject(result, pluginName, prompt);
            console.log(`✅ AI Service: Successfully parsed with strategy ${i + 1}`);
            return validatedProject;
          } else {
            console.log(`⚠️ AI Service: Strategy ${i + 1} parsed but failed validation: ${validationResult.errors.join(', ')}`);
            continue;
          }
        }
      } catch (error) {
        console.log(`⚠️ AI Service: Strategy ${i + 1} failed: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('All JSON parsing strategies failed with enhanced validation');
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
    cleaned = cleaned.replace(/\\n/g, '\\n')
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
      cleaned = cleaned.replace(/"content":\s*"([^"]*(?:\\"[^"]*)*)"(?=\s*,|\s*})/g, (match, content) => {
        // Re-escape content that might have unescaped quotes
        const properlyEscaped = content.replace(/\\"/g, '"').replace(/"/g, '\\"');
        return `"content": "${properlyEscaped}"`;
      });
      
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
    return trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.length > 10;
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
  private validateJSONStructure(obj: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check top-level structure
    if (!obj || typeof obj !== 'object') {
      errors.push('Response is not an object');
      return { isValid: false, errors };
    }
    
    // Check required fields
    const requiredFields = ['projectName', 'minecraftVersion', 'files', 'dependencies', 'buildInstructions'];
    for (const field of requiredFields) {
      if (!(field in obj)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate projectName
    if (obj.projectName && (typeof obj.projectName !== 'string' || obj.projectName.trim().length === 0)) {
      errors.push('projectName must be a non-empty string');
    }
    
    // Validate minecraftVersion
    if (obj.minecraftVersion && (typeof obj.minecraftVersion !== 'string' || !obj.minecraftVersion.match(/^\d+\.\d+(\.\d+)?$/))) {
      errors.push('minecraftVersion must be a valid version string (e.g., 1.20.1)');
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
          
          if (!file.path || typeof file.path !== 'string' || file.path.trim().length === 0) {
            errors.push(`File ${index} missing or invalid path`);
          }
          
          if (!file.content || typeof file.content !== 'string') {
            errors.push(`File ${index} missing or invalid content`);
          }
          
          if (!file.type || typeof file.type !== 'string' || file.type.trim().length === 0) {
            errors.push(`File ${index} missing or invalid type`);
          }
          
          // Validate file path format
          if (file.path && (file.path.includes('..') || file.path.startsWith('/') || file.path.includes('\\'))) {
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
    if (obj.buildInstructions && (typeof obj.buildInstructions !== 'string' || obj.buildInstructions.trim().length === 0)) {
      errors.push('buildInstructions must be a non-empty string');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate and sanitize the parsed project structure
   */
  private validateAndSanitizeProject(project: any, pluginName: string, prompt: string): PluginProject {
    // Ensure required fields exist
    const sanitized: PluginProject = {
      projectName: this.validateString(project.projectName, pluginName),
      minecraftVersion: this.validateString(project.minecraftVersion, '1.20.1'),
      files: this.validateFiles(project.files, pluginName, prompt),
      dependencies: this.validateArray(project.dependencies, ['org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT']),
      buildInstructions: this.validateString(project.buildInstructions, 'mvn clean compile package')
    };
    
    // Ensure we have at least basic required files
    this.ensureRequiredFiles(sanitized, pluginName, prompt);
    
    console.log(`📁 AI Service: Validated project with ${sanitized.files.length} files`);
    return sanitized;
  }

  /**
   * Validate string fields with fallback
   */
  private validateString(value: any, fallback: string): string {
    return (typeof value === 'string' && value.trim().length > 0) ? value.trim() : fallback;
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
  private validateFiles(files: any, pluginName: string, prompt: string): PluginFile[] {
    if (!Array.isArray(files)) {
      console.log(`⚠️ AI Service: Files is not an array, creating minimal structure`);
      return this.createMinimalFileStructure(pluginName, prompt);
    }
    
    const validFiles: PluginFile[] = [];
    
    for (const file of files) {
      try {
        if (this.isValidFile(file)) {
          validFiles.push({
            path: file.path.trim(),
            content: this.sanitizeFileContent(file.content),
            type: file.type ? file.type.trim() : this.getFileTypeFromPath(file.path)
          });
        } else {
          console.log(`⚠️ AI Service: Skipping invalid file:`, file);
        }
      } catch (error) {
        console.log(`⚠️ AI Service: Error processing file: ${error.message}`);
      }
    }
    
    return validFiles.length > 0 ? validFiles : this.createMinimalFileStructure(pluginName, prompt);
  }

  /**
   * Check if a file object is valid
   */
  private isValidFile(file: any): boolean {
    return file && 
           typeof file.path === 'string' && 
           file.path.trim().length > 0 &&
           typeof file.content === 'string';
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
  private createMinimalFileStructure(pluginName: string, prompt: string): PluginFile[] {
    return this.promptTemplates.getFallbackProjectTemplate(pluginName, prompt).files;
  }

  /**
   * Ensure required files exist in the project
   */
  private ensureRequiredFiles(project: PluginProject, pluginName: string, prompt: string): void {
    const requiredFiles = ['plugin.yml', '.java', 'pom.xml'];
    const existingTypes = new Set(project.files.map(f => {
      if (f.path.includes('plugin.yml')) return 'plugin.yml';
      if (f.path.endsWith('.java')) return '.java';
      if (f.path.includes('pom.xml')) return 'pom.xml';
      return f.type;
    }));
    
    const missingFiles = requiredFiles.filter(type => !existingTypes.has(type));
    
    if (missingFiles.length > 0) {
      console.log(`⚠️ AI Service: Adding missing required files: ${missingFiles.join(', ')}`);
      const minimal = this.promptTemplates.getFallbackProjectTemplate(pluginName, prompt);
      
      for (const file of minimal.files) {
        if (missingFiles.some(missing => file.path.includes(missing) || file.path.endsWith(missing))) {
          project.files.push(file);
        }
      }
    }
  }
}
