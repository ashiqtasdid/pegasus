import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatHistoryDocument = ChatHistory & Document;

@Schema({ timestamps: true })
export class ChatHistory {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  pluginName: string;

  @Prop({ required: true })
  userMessage: string;

  @Prop({ required: true })
  assistantResponse: string;

  @Prop({ default: Date.now, index: true })
  timestamp: Date;

  @Prop({ type: Object })
  metadata?: {
    requestId?: string;
    sessionId?: string;
    messageType?: string;
    processingTime?: number;
    tokenUsage?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
  };

  @Prop({ type: [String], default: [] })
  filesModified?: string[];

  @Prop({ type: Object })
  operationsPerformed?: {
    filesCreated?: number;
    filesUpdated?: number;
    filesDeleted?: number;
    compilationAttempted?: boolean;
    autoFixAttempted?: boolean;
    mongoSyncPerformed?: boolean;
  };
}

export const ChatHistorySchema = SchemaFactory.createForClass(ChatHistory);
