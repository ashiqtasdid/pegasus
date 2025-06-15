import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiService } from './ai.service';
import { MavenService } from './maven.service';
import { ErrorFixService } from './error-fix.service';
import { DiskReaderService } from './disk-reader.service';
import { OpenRouterClient } from './openrouter.client';
import { AIPromptTemplates } from './ai-prompt-templates.service';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

describe('AppController', () => {
  let appController: AppController;
  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: AiService,
          useValue: {
            generatePluginCode: jest.fn(),
            enhancePrompt: jest.fn(),
          },
        },
        {
          provide: MavenService,
          useValue: {
            compileMavenProject: jest.fn(),
          },
        },
        {
          provide: ErrorFixService,
          useValue: {
            fixErrors: jest.fn(),
          },
        },
        {
          provide: DiskReaderService,
          useValue: {
            readProjectFromDisk: jest.fn(),
          },
        },
        {
          provide: OpenRouterClient,
          useValue: {
            call: jest.fn(),
          },
        },
        {
          provide: AIPromptTemplates,
          useValue: {
            getCodeGenerationPrompt: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
        {
          provide: ChatService,
          useValue: {
            checkUserHasPlugin: jest.fn(),
            getUserPlugins: jest.fn(),
            addPluginToUser: jest.fn(),
            removePluginFromUser: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should be defined', () => {
      expect(appController).toBeDefined();
    });
  });
});
