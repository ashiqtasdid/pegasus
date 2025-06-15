import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AiService } from './ai.service';
import { OpenRouterClient } from './openrouter.client';
import { AIPromptTemplates } from './ai-prompt-templates.service';

describe('AI Service Integration Tests', () => {
  let module: TestingModule;
  let aiService: AiService;
  let openRouterClient: OpenRouterClient;
  let promptTemplates: AIPromptTemplates;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.OPENROUTER_API_KEY = 'test-key-for-integration';
    process.env.YOUR_SITE_URL = 'http://localhost:3000';
    process.env.YOUR_SITE_NAME = 'Test Plugin Generator';

    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    aiService = module.get<AiService>(AiService);
    openRouterClient = module.get<OpenRouterClient>(OpenRouterClient);
    promptTemplates = module.get<AIPromptTemplates>(AIPromptTemplates);
  });

  afterAll(async () => {
    await module.close();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.YOUR_SITE_URL;
    delete process.env.YOUR_SITE_NAME;
  });

  describe('Component Integration', () => {
    it('should have all components properly wired', () => {
      expect(aiService).toBeDefined();
      expect(openRouterClient).toBeDefined();
      expect(promptTemplates).toBeDefined();
    });

    it('should validate OpenRouter client configuration', () => {
      const validation = openRouterClient.validateConfiguration();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should provide correct config info', () => {
      const config = openRouterClient.getConfigInfo();
      expect(config.hasApiKey).toBe(true);
      expect(config.siteUrl).toBe('http://localhost:3000');
      expect(config.siteName).toBe('Test Plugin Generator');
    });
  });

  describe('Prompt Templates Integration', () => {
    it('should generate comprehensive system prompts', () => {
      const systemPrompt = promptTemplates.getPluginGenerationSystemPrompt();
      
      // Check for accuracy enhancements
      expect(systemPrompt).toContain('AI SELF-VALIDATION PHASE');
      expect(systemPrompt).toContain('100% accurate');
      expect(systemPrompt).toContain('ABSOLUTE RESPONSE RULES');
      expect(systemPrompt.length).toBeGreaterThan(2000); // Comprehensive prompt
    });

    it('should generate context-aware user prompts', () => {
      const testCases = [
        {
          name: 'CommandPlugin',
          requirements: 'Create commands for teleportation',
          expectedHints: ['command handling', 'permission checks']
        },
        {
          name: 'EventPlugin', 
          requirements: 'Listen to player join events',
          expectedHints: ['event listeners', 'event handling']
        },
        {
          name: 'GUIPlugin',
          requirements: 'Create inventory GUI management',
          expectedHints: ['interactive inventory GUIs', 'click events']
        },        {
          name: 'StoragePlugin',
          requirements: 'Save player data to database',
          expectedHints: ['data persistence', 'database']
        }
      ];

      testCases.forEach(testCase => {
        const userPrompt = promptTemplates.getPluginGenerationUserPrompt(
          testCase.name,
          testCase.requirements
        );
        
        expect(userPrompt).toContain(testCase.name);
        expect(userPrompt).toContain(testCase.requirements);
        
        testCase.expectedHints.forEach(hint => {
          expect(userPrompt.toLowerCase()).toContain(hint.toLowerCase());
        });
      });
    });

    it('should provide optimized model configurations', () => {
      const configs = promptTemplates.getModelConfigurations();
      
      // Verify accuracy-focused settings
      expect(configs.codeGeneration.temperature).toBeLessThanOrEqual(0.1);
      expect(configs.errorFix.temperature).toBeLessThanOrEqual(0.05);
      expect(configs.validation.temperature).toBe(0.0);
      
      // Verify appropriate token limits for complex tasks
      expect(configs.codeGeneration.max_tokens).toBeGreaterThanOrEqual(16000);
      expect(configs.promptEnhancement.max_tokens).toBeGreaterThanOrEqual(6000);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate various plugin name formats', () => {
      const testCases = [
        { name: 'ValidPlugin', expected: true },
        { name: 'Valid_Plugin', expected: true },
        { name: 'Valid-Plugin', expected: true },
        { name: 'ValidPlugin123', expected: true },
        { name: '123Invalid', expected: false },
        { name: '', expected: false },
        { name: 'Invalid Plugin Space', expected: false },
        { name: 'Invalid@Plugin', expected: false },
      ];

      testCases.forEach(testCase => {
        const result = promptTemplates.validatePromptParameters(testCase.name, 'test requirements');
        expect(result.isValid).toBe(testCase.expected);
      });
    });

    it('should validate requirements length and content', () => {
      const validCases = [
        'Simple plugin',
        'Create a complex plugin with multiple features including commands, events, and GUI management.',
        'A'.repeat(5000) // Long but within limit
      ];      const invalidCases = [
        '', // Empty
        'A'.repeat(50001) // Too long (over 50k limit)
      ];

      validCases.forEach(req => {
        const result = promptTemplates.validatePromptParameters('TestPlugin', req);
        expect(result.isValid).toBe(true);
      });

      invalidCases.forEach(req => {
        const result = promptTemplates.validatePromptParameters('TestPlugin', req);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Fallback Project Generation', () => {
    it('should generate complete fallback projects for various plugin types', () => {
      const testPlugins = [
        { name: 'SimplePlugin', requirements: 'Basic plugin functionality' },
        { name: 'ComplexPlugin', requirements: 'Advanced features with commands and events' },
        { name: 'SpecialChars123', requirements: 'Plugin with numbers and special handling' }
      ];

      testPlugins.forEach(plugin => {
        const project = promptTemplates.getFallbackProjectTemplate(plugin.name, plugin.requirements);
        
        // Validate project structure
        expect(project.projectName).toBe(plugin.name);
        expect(project.minecraftVersion).toBe('1.20.1');
        expect(project.files).toHaveLength(4);
        expect(project.dependencies).toContain('org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT');
        
        // Validate file types
        const fileTypes = project.files.map(f => f.type);
        expect(fileTypes).toContain('java');
        expect(fileTypes).toContain('yaml');
        expect(fileTypes).toContain('xml');
        expect(fileTypes).toContain('md');
        
        // Validate Java file content
        const javaFile = project.files.find(f => f.type === 'java');
        expect(javaFile!.content).toContain('extends JavaPlugin');
        expect(javaFile!.content).toContain('onEnable()');
        expect(javaFile!.content).toContain('onDisable()');
        
        // Validate plugin.yml content
        const yamlFile = project.files.find(f => f.type === 'yaml');
        expect(yamlFile!.content).toContain(`name: ${plugin.name}`);
        expect(yamlFile!.content).toContain('api-version: 1.20');
        
        // Validate pom.xml content
        const xmlFile = project.files.find(f => f.type === 'xml');
        expect(xmlFile!.content).toContain('spigot-api');
        expect(xmlFile!.content).toContain('maven-compiler-plugin');
      });
    });

    it('should sanitize plugin names for package structure', () => {
      const testCases = [
        { input: 'Test-Plugin_123', expected: 'testplugin123' },
        { input: 'Special@#$Plugin', expected: 'specialplugin' },
        { input: 'UPPERCASE', expected: 'uppercase' }
      ];

      testCases.forEach(testCase => {
        const project = promptTemplates.getFallbackProjectTemplate(testCase.input, 'test');
        const javaFile = project.files.find(f => f.type === 'java');
        
        expect(javaFile!.path).toContain(testCase.expected);
        expect(javaFile!.content).toContain(`package com.example.${testCase.expected}`);
      });
    });
  });

  describe('Model Configuration Integration', () => {
    it('should provide configurations for all required tasks', () => {
      const configs = promptTemplates.getModelConfigurations();
      
      const requiredTasks = ['codeGeneration', 'promptEnhancement', 'errorFix', 'validation'];
      requiredTasks.forEach(task => {
        expect(configs[task]).toBeDefined();
        expect(configs[task].model).toBeDefined();
        expect(configs[task].temperature).toBeDefined();
        expect(configs[task].max_tokens).toBeDefined();
      });
    });

    it('should use Claude Sonnet 4 for accuracy-critical tasks', () => {
      const configs = promptTemplates.getModelConfigurations();
      
      // All tasks should use Claude Sonnet 4 for maximum accuracy
      expect(configs.codeGeneration.model).toBe('anthropic/claude-sonnet-4');
      expect(configs.promptEnhancement.model).toBe('anthropic/claude-sonnet-4');
      expect(configs.errorFix.model).toBe('anthropic/claude-sonnet-4');
      expect(configs.validation.model).toBe('anthropic/claude-sonnet-4');
    });

    it('should use progressively lower temperatures for higher accuracy needs', () => {
      const configs = promptTemplates.getModelConfigurations();
      
      // Temperature should decrease as accuracy requirements increase      expect(configs.promptEnhancement.temperature).toBeGreaterThan(configs.codeGeneration.temperature || 0);
      expect(configs.codeGeneration.temperature).toBeGreaterThan(configs.errorFix.temperature || 0);
      expect(configs.errorFix.temperature).toBeGreaterThan(configs.validation.temperature || 0);
    });
  });

  describe('Error Handling and Robustness', () => {
    it('should handle various edge cases gracefully', () => {
      // Test extreme plugin names
      const edgeCases = [
        { name: 'A', requirements: 'Minimal plugin' },
        { name: 'VeryLongPluginNameThatMightCauseIssues', requirements: 'Long name plugin' },
        { name: 'Plugin123', requirements: 'Numeric plugin' }
      ];

      edgeCases.forEach(testCase => {
        expect(() => {
          promptTemplates.getFallbackProjectTemplate(testCase.name, testCase.requirements);
        }).not.toThrow();
      });
    });

    it('should maintain consistent file structure across different inputs', () => {
      const inputs = [
        { name: 'Plugin1', req: 'Simple' },
        { name: 'Plugin2', req: 'Complex with many features' },
        { name: 'Plugin3', req: 'A'.repeat(1000) } // Long requirements
      ];

      inputs.forEach(input => {
        const project = promptTemplates.getFallbackProjectTemplate(input.name, input.req);
        
        // Should always have exactly 4 files
        expect(project.files).toHaveLength(4);
        
        // Should always have the same file types
        const types = project.files.map(f => f.type).sort();
        expect(types).toEqual(['java', 'md', 'xml', 'yaml']);
        
        // Should always have proper paths
        project.files.forEach(file => {
          expect(file.path).toBeTruthy();
          expect(file.path.length).toBeGreaterThan(0);
          expect(file.content).toBeTruthy();
          expect(file.content.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
