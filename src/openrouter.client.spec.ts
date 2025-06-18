import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenRouterClient } from './openrouter.client';

describe('OpenRouterClient', () => {
  let service: OpenRouterClient;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenRouterClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              switch (key) {
                case 'OPENROUTER_API_KEY':
                  return 'test-api-key';
                case 'YOUR_SITE_URL':
                  return defaultValue || 'http://localhost:3000';
                case 'YOUR_SITE_NAME':
                  return defaultValue || 'Test Plugin Generator';
                default:
                  return defaultValue;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OpenRouterClient>(OpenRouterClient);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should validate configuration correctly', () => {
    const validation = service.validateConfiguration();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should provide config info', () => {
    const config = service.getConfigInfo();
    expect(config.hasApiKey).toBe(true);
    expect(config.apiKeyLength).toBe(12); // 'test-api-key'.length
    expect(config.siteUrl).toBe('http://localhost:3000');
    expect(config.siteName).toBe('Pegasus Plugin Generator');
  });
  it('should throw error if API key is missing', () => {
    const emptyConfigService = new ConfigService();
    // Mock the get method to return empty string
    jest.spyOn(emptyConfigService, 'get').mockReturnValue('');

    expect(() => {
      new OpenRouterClient(emptyConfigService);
    }).toThrow('OPENROUTER_API_KEY is not configured in environment variables');
  });
});
