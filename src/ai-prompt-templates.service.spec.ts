import { Test, TestingModule } from '@nestjs/testing';
import { AIPromptTemplates } from './ai-prompt-templates.service';

describe('AIPromptTemplates', () => {
  let service: AIPromptTemplates;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AIPromptTemplates],
    }).compile();

    service = module.get<AIPromptTemplates>(AIPromptTemplates);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Plugin Generation Prompts', () => {
    it('should generate system prompt with validation requirements', () => {
      const systemPrompt = service.getPluginGenerationSystemPrompt();

      expect(systemPrompt).toContain('ABSOLUTE RESPONSE RULES');
      expect(systemPrompt).toContain('AI SELF-VALIDATION PHASE');
      expect(systemPrompt).toContain('FINAL CHECKLIST');
      expect(systemPrompt).toContain('100% accurate');
      expect(systemPrompt).toContain('NO placeholders, TODOs');
    });

    it('should generate enhanced user prompt with context analysis', () => {
      const userPrompt = service.getPluginGenerationUserPrompt(
        'TestPlugin',
        'Create a command that teleports players',
      );

      expect(userPrompt).toContain('TestPlugin');
      expect(userPrompt).toContain('command that teleports players');
      expect(userPrompt).toContain('PLUGIN IDENTITY');
      expect(userPrompt).toContain('FUNCTIONAL REQUIREMENTS');
      expect(userPrompt).toContain('IMPLEMENTATION STANDARDS');
    });

    it('should enhance requirements with technical context', () => {
      const userPrompt = service.getPluginGenerationUserPrompt(
        'CommandPlugin',
        'Add commands and events and GUI inventory',
      );

      expect(userPrompt).toContain(
        'command handling with proper permission checks',
      );
      expect(userPrompt).toContain(
        'event listeners with proper event handling',
      );
      expect(userPrompt).toContain('interactive inventory GUIs');
    });
  });

  describe('Prompt Enhancement', () => {
    it('should generate comprehensive enhancement system prompt', () => {
      const systemPrompt = service.getPromptEnhancementSystemPrompt();

      expect(systemPrompt).toContain(
        'expert Minecraft plugin development consultant',
      );
      expect(systemPrompt).toContain('ENHANCEMENT STRATEGY');
      expect(systemPrompt).toContain('CORE FUNCTIONALITY');
      expect(systemPrompt).toContain('TECHNICAL REQUIREMENTS');
      expect(systemPrompt).toContain('MINECRAFT-SPECIFIC CONSIDERATIONS');
    });

    it('should generate context-aware enhancement user prompt', () => {
      const userPrompt = service.getPromptEnhancementUserPrompt(
        'simple teleport command',
      );

      expect(userPrompt).toContain('simple teleport command');
      expect(userPrompt).toContain('ORIGINAL REQUIREMENT');
      expect(userPrompt).toContain('ENHANCEMENT INSTRUCTIONS');
      expect(userPrompt).toContain(
        'brief requirement that needs significant expansion',
      );
    });

    it('should detect and add context hints for complex requirements', () => {
      const userPrompt = service.getPromptEnhancementUserPrompt(
        'Create a complex plugin with commands for teleportation, event listeners for player join/leave, GUI inventory management, and database storage for player data',
      );

      expect(userPrompt).toContain('Include detailed command specifications');
      expect(userPrompt).toContain('Specify event handling requirements');
      expect(userPrompt).toContain('Detail GUI design and user interaction');
      expect(userPrompt).toContain('Define data persistence requirements');
    });
  });

  describe('Model Configurations', () => {
    it('should provide optimized model configurations', () => {
      const configs = service.getModelConfigurations();

      expect(configs.codeGeneration).toBeDefined();
      expect(configs.promptEnhancement).toBeDefined();
      expect(configs.errorFix).toBeDefined();
      expect(configs.validation).toBeDefined();

      // Check for accuracy-focused settings
      expect(configs.codeGeneration.temperature).toBe(0.1);
      expect(configs.errorFix.temperature).toBe(0.05);
      expect(configs.validation.temperature).toBe(0.0);

      // Check for appropriate token limits
      expect(configs.codeGeneration.max_tokens).toBe(16000);
      expect(configs.promptEnhancement.max_tokens).toBe(6000);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', () => {
      const result = service.validatePromptParameters(
        'TestPlugin',
        'Create a simple plugin',
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty plugin name', () => {
      const result = service.validatePromptParameters('', 'Create a plugin');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Plugin name is required');
    });

    it('should reject empty requirements', () => {
      const result = service.validatePromptParameters('TestPlugin', '');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Requirements are required');
    });

    it('should reject invalid plugin name format', () => {
      const result = service.validatePromptParameters(
        '123Invalid',
        'Create a plugin',
      );
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Plugin name must start with a letter and contain only letters, numbers, underscores, and hyphens',
      );
    });

    it('should reject too long parameters', () => {
      const longName = 'a'.repeat(101);
      const longRequirements = 'a'.repeat(50001);

      const nameResult = service.validatePromptParameters(longName, 'test');
      expect(nameResult.isValid).toBe(false);
      expect(nameResult.errors).toContain(
        'Plugin name is too long (max 100 characters)',
      );

      const reqResult = service.validatePromptParameters(
        'Test',
        longRequirements,
      );
      expect(reqResult.isValid).toBe(false);
      expect(reqResult.errors).toContain(
        'Requirements are too long (max 50000 characters)',
      );
    });
  });

  describe('Fallback Project Generation', () => {
    it('should generate fallback project template', () => {
      const project = service.getFallbackProjectTemplate(
        'TestPlugin',
        'Create a test plugin',
      );

      expect(project.projectName).toBe('TestPlugin');
      expect(project.minecraftVersion).toBe('1.20.1');
      expect(project.files).toHaveLength(4);
      expect(project.dependencies).toContain(
        'org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT',
      );
      expect(project.buildInstructions).toBe('mvn clean compile package');

      // Check for required files
      const filePaths = project.files.map((f) => f.path);
      expect(
        filePaths.some((path) => path.includes('TestPluginPlugin.java')),
      ).toBe(true);
      expect(filePaths.some((path) => path.includes('plugin.yml'))).toBe(true);
      expect(filePaths.some((path) => path.includes('pom.xml'))).toBe(true);
      expect(filePaths.some((path) => path.includes('README.md'))).toBe(true);
    });
    it('should generate valid Java class content', () => {
      const project = service.getFallbackProjectTemplate(
        'TestPlugin',
        'Create a test plugin',
      );
      const javaFile = project.files.find((f) => f.type === 'java');

      expect(javaFile).toBeDefined();
      expect(javaFile!.content).toContain('extends JavaPlugin');
      expect(javaFile!.content).toContain('onEnable()');
      expect(javaFile!.content).toContain('onDisable()');
      expect(javaFile!.content).toContain('package com.example.testplugin');
    });

    it('should generate valid plugin.yml content', () => {
      const project = service.getFallbackProjectTemplate(
        'TestPlugin',
        'Create a test plugin',
      );
      const yamlFile = project.files.find((f) => f.type === 'yaml');

      expect(yamlFile).toBeDefined();
      expect(yamlFile!.content).toContain('name: TestPlugin');
      expect(yamlFile!.content).toContain(
        'main: com.example.testplugin.TestPluginPlugin',
      );
      expect(yamlFile!.content).toContain('api-version: 1.20');
      expect(yamlFile!.content).toContain('version: 1.0.0');
    });
  });
});
