import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChatHistory,
  ChatHistoryDocument,
} from './schemas/chat-history.schema';

export interface ChatHistoryEntry {
  userId: string;
  pluginName: string;
  userMessage: string;
  assistantResponse: string;
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
  filesModified?: string[];
  operationsPerformed?: {
    filesCreated?: number;
    filesUpdated?: number;
    filesDeleted?: number;
    compilationAttempted?: boolean;
    autoFixAttempted?: boolean;
    mongoSyncPerformed?: boolean;
  };
}

export interface ChatHistoryFilter {
  userId?: string;
  pluginName?: string;
  startDate?: Date;
  endDate?: Date;
  messageType?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ChatHistoryService {
  constructor(
    @InjectModel(ChatHistory.name)
    private chatHistoryModel: Model<ChatHistoryDocument>,
  ) {}

  /**
   * Store a chat interaction in the database
   */
  async storeChatInteraction(
    entry: ChatHistoryEntry,
  ): Promise<ChatHistoryDocument> {
    try {
      console.log(
        `💬 Storing chat history for user "${entry.userId}", plugin "${entry.pluginName}"`,
      );

      const chatEntry = new this.chatHistoryModel({
        ...entry,
        timestamp: new Date(),
      });

      const saved = await chatEntry.save();

      console.log(`✅ Chat history stored successfully with ID: ${saved._id}`);
      return saved;
    } catch (error) {
      console.error(`❌ Failed to store chat history:`, error.message);
      throw new Error(`Failed to store chat history: ${error.message}`);
    }
  }

  /**
   * Get chat history for a specific user and plugin
   */
  async getChatHistory(filter: ChatHistoryFilter): Promise<{
    messages: ChatHistoryDocument[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const {
        userId,
        pluginName,
        startDate,
        endDate,
        messageType,
        limit = 50,
        offset = 0,
      } = filter;

      console.log(`📜 Getting chat history:`, {
        userId,
        pluginName,
        limit,
        offset,
      });

      // Build query
      const query: any = {};
      if (userId) query.userId = userId;
      if (pluginName) query.pluginName = pluginName;
      if (messageType) query['metadata.messageType'] = messageType;

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      // Get total count
      const total = await this.chatHistoryModel.countDocuments(query);

      // Get paginated results
      const messages = await this.chatHistoryModel
        .find(query)
        .sort({ timestamp: -1 }) // Most recent first
        .limit(limit)
        .skip(offset)
        .exec();

      const hasMore = offset + messages.length < total;

      console.log(
        `✅ Retrieved ${messages.length} chat messages (${total} total)`,
      );

      return {
        messages,
        total,
        hasMore,
      };
    } catch (error) {
      console.error(`❌ Failed to get chat history:`, error.message);
      throw new Error(`Failed to get chat history: ${error.message}`);
    }
  }

  /**
   * Get chat statistics for a user
   */
  async getChatStatistics(
    userId: string,
    pluginName?: string,
  ): Promise<{
    totalMessages: number;
    totalPlugins: number;
    messagesByPlugin: { pluginName: string; count: number }[];
    recentActivity: { date: string; count: number }[];
  }> {
    try {
      console.log(`📊 Getting chat statistics for user "${userId}"`);

      const matchStage: any = { userId };
      if (pluginName) matchStage.pluginName = pluginName;
      const pipeline: any[] = [
        { $match: matchStage },
        {
          $facet: {
            totalMessages: [{ $count: 'count' }],
            pluginStats: [
              { $group: { _id: '$pluginName', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ],
            recentActivity: [
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: -1 } },
              { $limit: 30 },
            ],
            uniquePlugins: [
              { $group: { _id: '$pluginName' } },
              { $count: 'count' },
            ],
          },
        },
      ];

      const result = await this.chatHistoryModel.aggregate(pipeline);
      const stats = result[0];

      const response = {
        totalMessages: stats.totalMessages[0]?.count || 0,
        totalPlugins: stats.uniquePlugins[0]?.count || 0,
        messagesByPlugin: stats.pluginStats.map((p: any) => ({
          pluginName: p._id,
          count: p.count,
        })),
        recentActivity: stats.recentActivity.map((a: any) => ({
          date: a._id,
          count: a.count,
        })),
      };

      console.log(
        `✅ Chat statistics retrieved: ${response.totalMessages} messages across ${response.totalPlugins} plugins`,
      );
      return response;
    } catch (error) {
      console.error(`❌ Failed to get chat statistics:`, error.message);
      throw new Error(`Failed to get chat statistics: ${error.message}`);
    }
  }

  /**
   * Delete chat history for a user/plugin
   */
  async deleteChatHistory(
    userId: string,
    pluginName?: string,
  ): Promise<{ deletedCount: number }> {
    try {
      const query: any = { userId };
      if (pluginName) query.pluginName = pluginName;

      console.log(`🗑️ Deleting chat history:`, query);

      const result = await this.chatHistoryModel.deleteMany(query);

      console.log(`✅ Deleted ${result.deletedCount} chat history entries`);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      console.error(`❌ Failed to delete chat history:`, error.message);
      throw new Error(`Failed to delete chat history: ${error.message}`);
    }
  }

  /**
   * Clean up old chat history (older than specified days)
   */
  async cleanupOldHistory(
    daysToKeep: number = 90,
  ): Promise<{ deletedCount: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      console.log(
        `🧹 Cleaning up chat history older than ${daysToKeep} days (before ${cutoffDate.toISOString()})`,
      );

      const result = await this.chatHistoryModel.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      console.log(
        `✅ Cleaned up ${result.deletedCount} old chat history entries`,
      );
      return { deletedCount: result.deletedCount };
    } catch (error) {
      console.error(`❌ Failed to cleanup old chat history:`, error.message);
      throw new Error(`Failed to cleanup old chat history: ${error.message}`);
    }
  }
}
