import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiService } from './ai.service';
import { OpenRouterClient } from './openrouter.client';
import { AIPromptTemplates } from './ai-prompt-templates.service';
import { MavenService } from './maven.service';
import { DiskReaderService } from './disk-reader.service';
import { ErrorFixService } from './error-fix.service';
import { ChatService } from './chat.service';
import { PluginDbService } from './plugin-db.service';
import { ChatHistoryService } from './chat-history.service';
import { Plugin, PluginSchema } from './schemas/plugin.schema';
import { ChatHistory, ChatHistorySchema } from './schemas/chat-history.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/pegasus',
    ),
    MongooseModule.forFeature([
      { name: Plugin.name, schema: PluginSchema },
      { name: ChatHistory.name, schema: ChatHistorySchema },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AiService,
    OpenRouterClient,
    AIPromptTemplates,
    MavenService,
    DiskReaderService,
    ErrorFixService,
    ChatService,
    PluginDbService,
    ChatHistoryService,
  ],
})
export class AppModule {}
