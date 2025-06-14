import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { OpenRouterClient } from './openrouter.client';
import { AIPromptTemplates } from './ai-prompt-templates.service';

describe('AiService', () => {
  let service: AiService;
  let openRouterClient: OpenRouterClient;
  let promptTemplates: AIPromptTemplates;

  const mockOpenRouterResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            projectName: 'TestPlugin',
            minecraftVersion: '1.20.1',
            files: [
              {
                path: 'src/main/java/com/example/testplugin/TestPluginPlugin.java',
                content: 'package com.example.testplugin;\n\nimport org.bukkit.plugin.java.JavaPlugin;\n\npublic class TestPluginPlugin extends JavaPlugin {\n    @Override\n    public void onEnable() {\n        getLogger().info("TestPlugin enabled!");\n    }\n    \n    @Override\n    public void onDisable() {\n        getLogger().info("TestPlugin disabled!");\n    }\n}',
                type: 'java'
              },
              {
                path: 'src/main/resources/plugin.yml',
                content: 'name: TestPlugin\nversion: 1.0.0\nmain: com.example.testplugin.TestPluginPlugin\napi-version: 1.20',
                type: 'yaml'
              },
              {
                path: 'pom.xml',
                content: '<?xml version="1.0" encoding="UTF-8"?>\n<project>\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.example</groupId>\n  <artifactId>testplugin</artifactId>\n  <version>1.0.0</version>\n  <dependencies>\n    <dependency>\n      <groupId>org.spigotmc</groupId>\n      <artifactId>spigot-api</artifactId>\n      <version>1.20.1-R0.1-SNAPSHOT</version>\n    </dependency>\n  </dependencies>\n</project>',
                type: 'xml'
              },
              {
                path: 'README.md',
                content: '# TestPlugin\n\nA test plugin for Minecraft.\n\n## Build\n\n```bash\nmvn clean compile package\n```',
                type: 'md'
              }
            ],
            dependencies: ['org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT'],
            buildInstructions: 'mvn clean compile package'
          }),
          role: 'assistant'
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: OpenRouterClient,
          useValue: {
            chatCompletion: jest.fn().mockResolvedValue(mockOpenRouterResponse),
          },
        },
        {
          provide: AIPromptTemplates,
          useValue: {
            getPluginGenerationSystemPrompt: jest.fn().mockReturnValue('System prompt for plugin generation'),
            getPluginGenerationUserPrompt: jest.fn().mockReturnValue('User prompt for TestPlugin'),
            getPromptEnhancementSystemPrompt: jest.fn().mockReturnValue('System prompt for enhancement'),
            getPromptEnhancementUserPrompt: jest.fn().mockReturnValue('Enhanced prompt'),
            getModelConfigurations: jest.fn().mockReturnValue({
              codeGeneration: {
                model: 'anthropic/claude-sonnet-4',
                temperature: 0.1,
                max_tokens: 16000,
                top_p: 0.9
              },
              promptEnhancement: {
                model: 'anthropic/claude-sonnet-4',
                temperature: 0.3,
                max_tokens: 6000,
                top_p: 0.95
              }
            }),
            validatePromptParameters: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
            getFallbackProjectTemplate: jest.fn().mockReturnValue({
              projectName: 'TestPlugin',
              minecraftVersion: '1.20.1',
              files: [
                {
                  path: 'src/main/java/com/example/testplugin/TestPluginPlugin.java',
                  content: 'fallback content',
                  type: 'java'
                }
              ],
              dependencies: ['org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT'],
              buildInstructions: 'mvn clean compile package'
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    openRouterClient = module.get<OpenRouterClient>(OpenRouterClient);
    promptTemplates = module.get<AIPromptTemplates>(AIPromptTemplates);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePluginCode', () => {
    it('should generate plugin code successfully', async () => {
      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      
      expect(result).toBeDefined();
      expect(result.projectName).toBe('TestPlugin');
      expect(result.minecraftVersion).toBe('1.20.1');
      expect(result.files).toHaveLength(4);
      expect(result.dependencies).toContain('org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT');
      
      expect(openRouterClient.chatCompletion).toHaveBeenCalledWith({
        model: 'anthropic/claude-sonnet-4',
        messages: expect.any(Array),
        max_tokens: 16000,
        temperature: 0.1,
        top_p: 0.9
      });
    });

    it('should validate parameters before generation', async () => {
      await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      
      expect(promptTemplates.validatePromptParameters).toHaveBeenCalledWith('TestPlugin', 'Create a test plugin');
    });

    it('should use fallback when JSON parsing fails', async () => {
      // Mock invalid JSON response
      const invalidResponse = {
        ...mockOpenRouterResponse,
        choices: [{
          message: { content: 'Invalid JSON response', role: 'assistant' },
          finish_reason: 'stop'
        }]
      };
      
      (openRouterClient.chatCompletion as jest.Mock).mockResolvedValueOnce(invalidResponse);
      
      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      
      expect(result).toBeDefined();
      expect(promptTemplates.getFallbackProjectTemplate).toHaveBeenCalledWith('TestPlugin', 'Create a test plugin');
    });

    it('should throw error for invalid parameters', async () => {
      (promptTemplates.validatePromptParameters as jest.Mock).mockReturnValueOnce({
        isValid: false,
        errors: ['Plugin name is required']
      });
      
      await expect(service.generatePluginCode('', '')).rejects.toThrow('Invalid parameters: Plugin name is required');
    });
  });

  describe('enhancePrompt', () => {
    it('should enhance prompt successfully', async () => {
      const enhancedResponse = {
        ...mockOpenRouterResponse,
        choices: [{
          message: { content: 'Enhanced detailed prompt', role: 'assistant' },
          finish_reason: 'stop'
        }]
      };
      
      (openRouterClient.chatCompletion as jest.Mock).mockResolvedValueOnce(enhancedResponse);
      
      const result = await service.enhancePrompt('simple plugin');
      
      expect(result).toBe('Enhanced detailed prompt');
      expect(openRouterClient.chatCompletion).toHaveBeenCalledWith({
        model: 'anthropic/claude-sonnet-4',
        messages: expect.any(Array),
        temperature: 0.3,
        max_tokens: 6000,
        top_p: 0.95
      });
    });

    it('should return original prompt if enhancement fails', async () => {
      (openRouterClient.chatCompletion as jest.Mock).mockResolvedValueOnce({
        choices: []
      });
      
      const result = await service.enhancePrompt('original prompt');
      
      expect(result).toBe('original prompt');
    });
  });

  describe('JSON Parsing Strategies', () => {
    it('should parse valid JSON directly', async () => {
      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      expect(result.projectName).toBe('TestPlugin');
    });

    it('should handle malformed JSON with cleaning', async () => {
      const malformedResponse = {
        ...mockOpenRouterResponse,
        choices: [{
          message: { 
            content: `Here's your plugin: ${JSON.stringify({
              projectName: 'TestPlugin',
              minecraftVersion: '1.20.1',
              files: [],
              dependencies: [],
              buildInstructions: 'mvn clean compile package'
            })} Hope this helps!`,
            role: 'assistant' 
          },
          finish_reason: 'stop'
        }]
      };
      
      (openRouterClient.chatCompletion as jest.Mock).mockResolvedValueOnce(malformedResponse);
      
      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      expect(result.projectName).toBe('TestPlugin');
    });

    it('should extract JSON from markdown code blocks', async () => {
      const markdownResponse = {
        ...mockOpenRouterResponse,
        choices: [{
          message: { 
            content: `\`\`\`json\n${JSON.stringify({
              projectName: 'TestPlugin',
              minecraftVersion: '1.20.1',
              files: [],
              dependencies: [],
              buildInstructions: 'mvn clean compile package'
            })}\n\`\`\``,
            role: 'assistant' 
          },
          finish_reason: 'stop'
        }]
      };
      
      (openRouterClient.chatCompletion as jest.Mock).mockResolvedValueOnce(markdownResponse);
      
      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      expect(result.projectName).toBe('TestPlugin');
    });
  });

  describe('Project Validation', () => {
    it('should validate project structure', async () => {
      const validProject = {
        projectName: 'TestPlugin',
        minecraftVersion: '1.20.1',
        files: [
          {
            path: 'src/main/java/com/example/testplugin/TestPluginPlugin.java',
            content: 'package com.example.testplugin;\n\nimport org.bukkit.plugin.java.JavaPlugin;\n\npublic class TestPluginPlugin extends JavaPlugin {\n    @Override\n    public void onEnable() {\n        getLogger().info("enabled");\n    }\n    @Override\n    public void onDisable() {\n        getLogger().info("disabled");\n    }\n}',
            type: 'java'
          },
          {
            path: 'src/main/resources/plugin.yml',
            content: 'name: TestPlugin\nversion: 1.0.0\nmain: com.example.testplugin.TestPluginPlugin',
            type: 'yaml'
          },
          {
            path: 'pom.xml',
            content: '<project><dependencies><dependency><groupId>org.spigotmc</groupId><artifactId>spigot-api</artifactId></dependency></dependencies></project>',
            type: 'xml'
          },
          {
            path: 'README.md',
            content: '# TestPlugin',
            type: 'md'
          }
        ],
        dependencies: ['org.spigotmc:spigot-api:1.20.1-R0.1-SNAPSHOT'],
        buildInstructions: 'mvn clean compile package'
      };

      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      expect(result.files.length).toBeGreaterThanOrEqual(4);
    });

    it('should detect missing required files', async () => {
      const incompleteResponse = {
        ...mockOpenRouterResponse,
        choices: [{
          message: {
            content: JSON.stringify({
              projectName: 'TestPlugin',
              minecraftVersion: '1.20.1',
              files: [
                {
                  path: 'incomplete.txt',
                  content: 'incomplete',
                  type: 'txt'
                }
              ],
              dependencies: [],
              buildInstructions: 'mvn clean compile package'
            }),
            role: 'assistant'
          },
          finish_reason: 'stop'
        }]
      };
      
      (openRouterClient.chatCompletion as jest.Mock).mockResolvedValueOnce(incompleteResponse);
      
      const result = await service.generatePluginCode('Create a test plugin', 'TestPlugin');
      
      // Should fall back to template
      expect(promptTemplates.getFallbackProjectTemplate).toHaveBeenCalled();
    });
  });
});
