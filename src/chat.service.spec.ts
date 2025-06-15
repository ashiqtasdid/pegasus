import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { OpenRouterClient } from './openrouter.client';
import { ErrorFixService } from './error-fix.service';
import { MavenService } from './maven.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockOpenRouterClient: Partial<OpenRouterClient>;
  let mockErrorFixService: Partial<ErrorFixService>;
  let mockMavenService: Partial<MavenService>;

  beforeEach(async () => {
    // Create a mock OpenRouterClient
    mockOpenRouterClient = {
      chatCompletion: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{"query": "info"}' } }],
        usage: { total_tokens: 10 }
      })
    };

    // Create a mock ErrorFixService
    mockErrorFixService = {
      fixAndCompile: jest.fn().mockResolvedValue({
        success: true,
        message: 'Plugin compiled successfully',
        finalCompilationResult: { success: true, message: 'Compilation successful' }
      })
    };

    // Create a mock MavenService
    mockMavenService = {
      compilePlugin: jest.fn().mockResolvedValue({
        success: true,
        message: 'Plugin compiled successfully'
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: OpenRouterClient,
          useValue: mockOpenRouterClient
        },
        {
          provide: ErrorFixService,
          useValue: mockErrorFixService
        },
        {
          provide: MavenService,
          useValue: mockMavenService
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENROUTER_API_KEY') return 'test-key';
              return 'test-value';
            })
          }
        }
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkUserHasPlugin', () => {
    it('should return true for valid plugin and user (placeholder)', async () => {
      const result = await service.checkUserHasPlugin('testPlugin', 'testUser');
      expect(result).toBe(true);
    });

    it('should return false for empty plugin name', async () => {
      const result = await service.checkUserHasPlugin('', 'testUser');
      expect(result).toBe(false);
    });

    it('should return false for empty username', async () => {
      const result = await service.checkUserHasPlugin('testPlugin', '');
      expect(result).toBe(false);
    });

    it('should handle whitespace in inputs', async () => {
      const result = await service.checkUserHasPlugin('  testPlugin  ', '  testUser  ');
      expect(result).toBe(true);
    });
  });

  describe('getUserPlugins', () => {
    it('should return empty array for valid user (placeholder)', async () => {
      const result = await service.getUserPlugins('testUser');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty username', async () => {
      const result = await service.getUserPlugins('');
      expect(result).toEqual([]);
    });
  });

  describe('addPluginToUser', () => {
    it('should return true for valid inputs (placeholder)', async () => {
      const result = await service.addPluginToUser('testPlugin', 'testUser');
      expect(result).toBe(true);
    });

    it('should return false for empty plugin name', async () => {
      const result = await service.addPluginToUser('', 'testUser');
      expect(result).toBe(false);
    });

    it('should return false for empty username', async () => {
      const result = await service.addPluginToUser('testPlugin', '');
      expect(result).toBe(false);
    });
  });

  describe('removePluginFromUser', () => {
    it('should return true for valid inputs (placeholder)', async () => {
      const result = await service.removePluginFromUser('testPlugin', 'testUser');
      expect(result).toBe(true);
    });

    it('should return false for empty plugin name', async () => {
      const result = await service.removePluginFromUser('', 'testUser');
      expect(result).toBe(false);
    });

    it('should return false for empty username', async () => {
      const result = await service.removePluginFromUser('testPlugin', '');
      expect(result).toBe(false);
    });
  });
});
