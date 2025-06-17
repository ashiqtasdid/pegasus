import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PluginDocument = Plugin & Document;

@Schema({ collection: 'plugins', timestamps: true })
export class Plugin {
  @Prop({ required: true })
  _id: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  pluginName: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  minecraftVersion: string;

  @Prop({ type: [String], default: [] })
  dependencies: string[];

  @Prop({ type: [Object], default: [] })
  files: Array<{
    path: string;
    content: string;
    size: number;
    lastModified: Date;
    type: string; // 'java', 'xml', 'yaml', 'json', 'properties', 'md', 'txt'
  }>;

  @Prop({ type: Object, required: true })
  metadata: {
    author: string;
    version: string;
    mainClass: string;
    apiVersion: string;
  };

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // Additional metadata for sync tracking
  @Prop({ type: Date })
  lastSyncedAt: Date;

  @Prop({ type: String })
  diskPath: string;

  @Prop({ type: Number, default: 0 })
  totalFiles: number;

  @Prop({ type: Number, default: 0 })
  totalSize: number;
}

export const PluginSchema = SchemaFactory.createForClass(Plugin);

// Create indexes for better performance
PluginSchema.index({ userId: 1, pluginName: 1 }, { unique: true });
PluginSchema.index({ userId: 1 });
PluginSchema.index({ isActive: 1 });
PluginSchema.index({ createdAt: -1 });
PluginSchema.index({ updatedAt: -1 });
