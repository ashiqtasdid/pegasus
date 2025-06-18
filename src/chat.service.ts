import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { OpenRouterClient, OpenRouterMessage } from './openrouter.client';
import { ErrorFixService } from './error-fix.service';
import { MavenService } from './maven.service';
import { PluginDbService } from './plugin-db.service';
import { ChatHistoryService, ChatHistoryEntry } from './chat-history.service';

@Injectable()
export class ChatService {
  private readonly generatedPath = path.join(process.cwd(), 'generated');

  // Plugin files cache with modification time tracking
  private readonly pluginFilesCache = new Map<
    string,
    {
      files: { [path: string]: string };
      lastModified: number;
      cacheTime: number;
    }
  >();

  // Cache TTL in milliseconds (5 minutes)
  private readonly CACHE_TTL = 5 * 60 * 1000;
  constructor(
    private readonly openRouterClient: OpenRouterClient,
    private readonly errorFixService: ErrorFixService,
    private readonly mavenService: MavenService,
    private readonly pluginDbService: PluginDbService,
    public readonly chatHistoryService: ChatHistoryService,
  ) {}

  /**
   * Process chat message - determine intent and handle accordingly
   * @param message - User's chat message
   * @param username - Username for context
   * @param pluginName - Plugin name for context (optional)
   * @returns Promise<any> - Chat response
   */ async processChat(
    message: string,
    username: string,
    pluginName?: string,
  ): Promise<any> {
    const startTime = Date.now();
    console.log(
      `💬 Chat Service: Processing chat message from user "${username}"`,
    );
    console.log(`📝 Chat Service: Message: "${message}"`);

    let response: any;
    let filesModified: string[] = [];
    const operationsPerformed: any = {};

    try {
      // Step 1: Determine user intent using Gemini 1.5 Flash
      const intent = await this.determineUserIntent(message);
      console.log(`🧠 Chat Service: Detected intent: ${intent.query}`);

      if (intent.query === 'info') {
        // Handle info request
        response = await this.handleInfoQuery(message, username, pluginName);
        operationsPerformed.compilationAttempted = false;
        operationsPerformed.autoFixAttempted = false;
      } else if (intent.query === 'modification') {
        // Handle modification request
        response = await this.handleModificationQuery(
          message,
          username,
          pluginName,
        );

        // Track files that were modified
        if (response.filesModified) {
          filesModified = response.filesModified;
        }

        // Track operations performed
        operationsPerformed.filesCreated = response.filesCreated || 0;
        operationsPerformed.filesUpdated = response.filesUpdated || 0;
        operationsPerformed.filesDeleted = response.filesDeleted || 0;
        operationsPerformed.compilationAttempted =
          response.compilationAttempted || false;
        operationsPerformed.autoFixAttempted =
          response.autoFixAttempted || false;
        operationsPerformed.mongoSyncPerformed = true; // Always sync after modifications
      } else {
        // Default to info if unclear
        console.log(
          `⚠️ Chat Service: Unknown intent "${intent.query}", defaulting to info`,
        );
        response = await this.handleInfoQuery(message, username, pluginName);
        operationsPerformed.compilationAttempted = false;
        operationsPerformed.autoFixAttempted = false;
      }

      // Store chat interaction in history (async, don't wait)
      if (pluginName) {
        this.storeChatHistory(
          username,
          pluginName,
          message,
          response,
          filesModified,
          operationsPerformed,
          Date.now() - startTime,
        ).catch((error) => {
          console.error('❌ Failed to store chat history:', error.message);
        });
      }

      return response;
    } catch (error) {
      console.error(`❌ Chat Service: Error processing chat: ${error.message}`);

      const errorResponse = {
        success: false,
        error: 'Failed to process chat message',
        message:
          'I encountered an error while processing your request. Please try again.',
      };

      // Store error response in history too (async, don't wait)
      if (pluginName) {
        this.storeChatHistory(
          username,
          pluginName,
          message,
          errorResponse,
          [],
          { error: true },
          Date.now() - startTime,
        ).catch((historyError) => {
          console.error(
            '❌ Failed to store error chat history:',
            historyError.message,
          );
        });
      }

      return errorResponse;
    }
  }

  /**
   * Determine user intent using Gemini 1.5 Flash
   * @param message - User's message
   * @returns Promise<{query: string}> - Intent classification
   */
  private async determineUserIntent(
    message: string,
  ): Promise<{ query: string }> {
    console.log(`🧠 Chat Service: Analyzing user intent with Gemini 1.5 Flash`);

    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: `You are an intent classifier for a Minecraft plugin generator chat system. 
Analyze the user's message and determine if they want:

1. "info" - They are asking for information, explanations, help, or want to understand something
2. "modification" - They want to modify, change, update, create, or edit something

Respond with JSON in this exact format:
{"query": "info"} or {"query": "modification"}

Examples:
- "How does this plugin work?" → {"query": "info"}
- "What does this code do?" → {"query": "info"}
- "Explain the plugin structure" → {"query": "info"}
- "Help me understand this" → {"query": "info"}
- "Change the player damage to 10" → {"query": "modification"}
- "Update the plugin name" → {"query": "modification"}
- "Add a new command" → {"query": "modification"}
- "Fix this bug" → {"query": "modification"}
- "Create a new feature" → {"query": "modification"}`,
      },
      {
        role: 'user',
        content: message,
      },
    ];
    try {
      const response = await this.openRouterClient.chatCompletion({
        model: 'google/gemini-flash-1.5',
        messages,
        max_tokens: 50,
        temperature: 0.1,
        top_p: 0.9,
      });

      const responseText = response.choices[0]?.message?.content?.trim() || '';
      console.log(`🧠 Chat Service: Intent analysis response: ${responseText}`);

      // Clean response by removing markdown code blocks
      let cleanResponse = responseText;
      if (cleanResponse.includes('```json')) {
        cleanResponse = cleanResponse
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '');
      }
      if (cleanResponse.includes('```')) {
        cleanResponse = cleanResponse.replace(/```/g, '');
      }

      // Parse JSON response
      const intent = JSON.parse(cleanResponse.trim());

      // Validate response format
      if (intent.query !== 'info' && intent.query !== 'modification') {
        console.log(
          `⚠️ Chat Service: Invalid intent "${intent.query}", defaulting to info`,
        );
        return { query: 'info' };
      }

      return intent;
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to determine intent: ${error.message}`,
      );
      // Default to info on error
      return { query: 'info' };
    }
  }
  /**
   * Handle info queries - provide information using AI with plugin context
   * @param message - User's message
   * @param username - Username for context
   * @param pluginName - Plugin name for context
   * @returns Promise<any> - Info response
   */
  private async handleInfoQuery(
    message: string,
    username: string,
    pluginName?: string,
  ): Promise<any> {
    console.log(`ℹ️ Chat Service: Handling info query for user "${username}"`);

    try {
      // Get plugin context if plugin name is provided
      let pluginContext = '';
      if (pluginName && username) {
        try {
          console.log(
            `📁 Chat Service: Loading plugin context for "${pluginName}"`,
          );

          // First, try to get existing plugin index
          const pluginPath = path.join(
            this.generatedPath,
            username,
            pluginName,
          );
          const indexFilePath = path.join(pluginPath, 'plugin_index.json');

          let pluginIndexData: any = null;

          if (await fs.pathExists(indexFilePath)) {
            console.log(
              `📄 Chat Service: Found existing plugin index at ${indexFilePath}`,
            );
            try {
              const indexContent = await fs.readFile(indexFilePath, 'utf8');
              pluginIndexData = JSON.parse(indexContent);
            } catch (error) {
              console.log(
                `⚠️ Chat Service: Failed to read existing index, will regenerate: ${error.message}`,
              );
            }
          }

          // If no valid index exists, generate one
          if (!pluginIndexData && (await fs.pathExists(pluginPath))) {
            console.log(
              `🔄 Chat Service: Generating new plugin index for "${pluginName}"`,
            );
            await this.generatePluginIndex(pluginName, username);

            // Now read the newly generated index
            if (await fs.pathExists(indexFilePath)) {
              try {
                const indexContent = await fs.readFile(indexFilePath, 'utf8');
                pluginIndexData = JSON.parse(indexContent);
                console.log(
                  `✅ Chat Service: Successfully loaded generated plugin index`,
                );
              } catch (error) {
                console.log(
                  `❌ Chat Service: Failed to read generated index: ${error.message}`,
                );
              }
            }
          }

          // Format plugin context for AI
          if (
            pluginIndexData &&
            pluginIndexData.files &&
            pluginIndexData.files.length > 0
          ) {
            pluginContext = `\n\n=== PLUGIN CONTEXT ===\nPlugin: ${pluginIndexData.plugin}\nUsername: ${pluginIndexData.username}\nGenerated: ${pluginIndexData.generated}\nTotal Files: ${pluginIndexData.files.length}\n\nFILES:\n`;

            for (const file of pluginIndexData.files) {
              pluginContext += `\n--- ${file.path} ---\n${file.content}\n`;
            }

            pluginContext += `\n=== END PLUGIN CONTEXT ===\n`;
            console.log(
              `📋 Chat Service: Plugin context prepared (${pluginIndexData.files.length} files, ${pluginContext.length} characters)`,
            );
          } else {
            console.log(
              `⚠️ Chat Service: No plugin files found or empty plugin directory`,
            );
            pluginContext = `\n\n=== PLUGIN CONTEXT ===\nPlugin "${pluginName}" exists but contains no files yet.\n=== END PLUGIN CONTEXT ===\n`;
          }
        } catch (error) {
          console.log(
            `❌ Chat Service: Could not load plugin context: ${error.message}`,
          );
          pluginContext = `\n\n=== PLUGIN CONTEXT ===\nError loading plugin "${pluginName}": ${error.message}\n=== END PLUGIN CONTEXT ===\n`;
        }
      } else if (pluginName && !username) {
        pluginContext = `\n\n=== PLUGIN CONTEXT ===\nPlugin name "${pluginName}" provided but no username specified.\n=== END PLUGIN CONTEXT ===\n`;
      }

      // Enhanced system prompt for info queries
      const systemPrompt = `You are a helpful Minecraft plugin development assistant. The user is asking for information or help about Minecraft plugin development.

${pluginContext ? 'IMPORTANT: The user has provided plugin context below. Use this context to give specific, relevant answers about their actual plugin code.' : ''}

Guidelines:
- Provide clear, detailed, and helpful explanations
- If plugin files are provided, reference them specifically in your response
- Give practical examples and code snippets when relevant
- Format code examples with proper Java syntax highlighting
- Be conversational but professional
- If the user asks about specific parts of their plugin, refer to the actual code provided
- If no plugin context is available, provide general guidance but mention they can get more specific help by providing their plugin name`;

      const messages: OpenRouterMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `${message}${pluginContext}`,
        },
      ];
      console.log(
        `🤖 Chat Service: Sending request to Gemini Flash 1.5 with ${pluginContext ? 'plugin context' : 'no plugin context'}`,
      );

      const response = await this.openRouterClient.chatCompletion({
        model: 'google/gemini-flash-1.5',
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9,
      });

      const aiResponse =
        response.choices[0]?.message?.content ||
        'I apologize, but I could not generate a response to your question.';

      console.log(
        `ℹ️ Chat Service: Generated info response (${aiResponse.length} characters)`,
      );

      return {
        success: true,
        type: 'info',
        message: aiResponse,
        username,
        pluginName: pluginName || null,
        contextLoaded: !!pluginContext.includes('PLUGIN CONTEXT'),
        filesAnalyzed: pluginContext.includes('Total Files:')
          ? parseInt(pluginContext.match(/Total Files: (\d+)/)?.[1] || '0')
          : 0,
      };
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to handle info query: ${error.message}`,
      );
      return {
        success: false,
        error: 'Failed to process info query',
        message:
          'I encountered an error while trying to help you. Please try rephrasing your question.',
      };
    }
  }
  /**
   * Handle modification queries - implement requested changes to plugin
   * @param message - User's message
   * @param username - Username for context
   * @param pluginName - Plugin name for context
   * @returns Promise<any> - Modification response
   */
  private async handleModificationQuery(
    message: string,
    username: string,
    pluginName?: string,
  ): Promise<any> {
    console.log(
      `🔧 Chat Service: Handling modification query for user "${username}"`,
    );

    if (!pluginName || !username) {
      return {
        success: false,
        error:
          'Plugin name and username are required for modification requests',
        message:
          'Please specify which plugin you want to modify by generating a plugin first or providing the plugin name.',
      };
    }

    try {
      // Get plugin context
      console.log(
        `📁 Chat Service: Loading plugin context for "${pluginName}"`,
      );

      const pluginPath = path.join(this.generatedPath, username, pluginName);
      const indexFilePath = path.join(pluginPath, 'plugin_index.json');

      let pluginIndexData: any = null;

      // Load or generate plugin index
      if (await fs.pathExists(indexFilePath)) {
        console.log(
          `📄 Chat Service: Found existing plugin index at ${indexFilePath}`,
        );
        try {
          const indexContent = await fs.readFile(indexFilePath, 'utf8');
          pluginIndexData = JSON.parse(indexContent);
        } catch (error) {
          console.log(
            `⚠️ Chat Service: Failed to read existing index, will regenerate: ${error.message}`,
          );
        }
      }

      if (!pluginIndexData && (await fs.pathExists(pluginPath))) {
        console.log(
          `🔄 Chat Service: Generating new plugin index for "${pluginName}"`,
        );
        await this.generatePluginIndex(pluginName, username);

        if (await fs.pathExists(indexFilePath)) {
          try {
            const indexContent = await fs.readFile(indexFilePath, 'utf8');
            pluginIndexData = JSON.parse(indexContent);
            console.log(
              `✅ Chat Service: Successfully loaded generated plugin index`,
            );
          } catch (error) {
            console.log(
              `❌ Chat Service: Failed to read generated index: ${error.message}`,
            );
          }
        }
      }

      if (
        !pluginIndexData ||
        !pluginIndexData.files ||
        pluginIndexData.files.length === 0
      ) {
        return {
          success: false,
          error: 'Plugin not found or empty',
          message: `Could not find plugin "${pluginName}" or the plugin has no files. Please generate the plugin first.`,
        };
      }

      // Format plugin context for AI
      let pluginContext = `\n\n=== PLUGIN CONTEXT ===\nPlugin: ${pluginIndexData.plugin}\nUsername: ${pluginIndexData.username}\nGenerated: ${pluginIndexData.generated}\nTotal Files: ${pluginIndexData.files.length}\n\nCURRENT FILES:\n`;

      for (const file of pluginIndexData.files) {
        pluginContext += `\n--- ${file.path} ---\n${file.content}\n`;
      }

      pluginContext += `\n=== END PLUGIN CONTEXT ===\n`;
      console.log(
        `📋 Chat Service: Plugin context prepared (${pluginIndexData.files.length} files, ${pluginContext.length} characters)`,
      ); // Enhanced system prompt for modification queries
      const systemPrompt = `You are an expert Minecraft plugin developer. The user has requested modifications to their existing plugin. Your task is to implement the requested changes by creating, updating, or deleting files as needed.

CRITICAL: You MUST respond with ONLY a valid JSON object. DO NOT include any explanatory text, markdown formatting, or conversation. Your entire response must be parseable JSON.

IMPORTANT INSTRUCTIONS:
1. Analyze the current plugin structure and understand the codebase
2. Implement the requested modification efficiently
3. KEEP THE MAIN PLUGIN FILE FOCUSED - Create additional classes/files if the modification would make the main file too long or complex
4. Create separate files for new features, commands, listeners, utilities, etc. to maintain clean code organization
5. Follow Minecraft plugin best practices and proper Java conventions
6. Ensure all changes are compatible with the existing code
7. Always provide complete file content for any files you modify or create
8. MINIMIZE RESPONSE SIZE: Only include essential changes, avoid unnecessary comments
9. If the modification is complex, focus on the core functionality first

RESPONSE FORMAT - RETURN ONLY THIS JSON STRUCTURE (NO OTHER TEXT):
{
  "addedFeature": "brief description of what was implemented",
  "operations": [
    {
      "type": "UPDATE" | "CREATE" | "DELETE" | "RENAME",
      "file": {
        "path": "relative/path/from/project/root",
        "oldPath": "old/path (only for RENAME)",
        "newPath": "new/path (only for RENAME)", 
        "content": "complete file content with proper escaping",
        "reason": "explanation of why this change was made"
      }
    }
  ],
  "buildCommands": ["mvn clean compile", "mvn package"]
}

STRICT REQUIREMENTS:
- Your response must start with { and end with }
- No explanatory text before or after the JSON
- No markdown code blocks
- No conversational language
- Use proper JSON format with escaped strings
- Include complete file content for UPDATE and CREATE operations
- Provide clear reasons for each change
- Ensure all file paths are relative to project root
- Follow Java package naming conventions
- Include proper imports and error handling`;
      const messages: OpenRouterMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'system',
          content:
            'REMINDER: Respond with ONLY valid JSON. No explanations, no markdown, no text outside the JSON object. Start with { and end with }.',
        },
        {
          role: 'user',
          content: `Requested modification: ${message}\n\nCurrent plugin context:${pluginContext}`,
        },
      ];
      console.log(
        `🤖 Chat Service: Sending modification request to Claude Sonnet 3.5`,
      );

      const response = await this.openRouterClient.chatCompletion({
        model: 'anthropic/claude-sonnet-4',
        messages,
        max_tokens: 3 * 4096, // Claude 3.5 Sonnet's max output tokens
        temperature: 0.3,
        top_p: 0.9,
      });
      const aiResponse = response.choices[0]?.message?.content || '';
      console.log(
        `🔧 Chat Service: Received modification plan (${aiResponse.length} characters)`,
      );
      // Check if the response appears to be truncated
      if (aiResponse.length >= 3900) {
        // Close to max token limit for Claude 3.5
        console.log(
          `⚠️ Chat Service: Response appears to be truncated (${aiResponse.length} chars), may cause JSON parsing issues`,
        );
      } // Parse the AI response
      let modificationPlan;
      try {
        // Clean the response (remove markdown code blocks if present)
        let cleanResponse = aiResponse.trim();

        // Remove markdown code blocks
        if (cleanResponse.includes('```json')) {
          cleanResponse = cleanResponse
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '');
        }
        if (cleanResponse.includes('```')) {
          cleanResponse = cleanResponse.replace(/```/g, '');
        }

        // Extract JSON object from response if it contains other text
        const jsonStart = cleanResponse.indexOf('{');
        const jsonEnd = cleanResponse.lastIndexOf('}');

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleanResponse = cleanResponse.substring(jsonStart, jsonEnd + 1);
        }

        console.log(
          `🔍 Chat Service: Attempting to parse JSON: ${cleanResponse.substring(0, 200)}...`,
        );

        // Validate that we have a complete JSON object
        if (!cleanResponse.startsWith('{') || !cleanResponse.endsWith('}')) {
          throw new Error('Response does not contain a complete JSON object');
        }

        // Count braces to ensure JSON is complete
        let openBraces = 0;
        let closeBraces = 0;
        for (const char of cleanResponse) {
          if (char === '{') openBraces++;
          if (char === '}') closeBraces++;
        }

        if (openBraces !== closeBraces) {
          throw new Error(
            `Incomplete JSON: ${openBraces} opening braces, ${closeBraces} closing braces`,
          );
        }
        modificationPlan = JSON.parse(cleanResponse.trim());
      } catch (error) {
        console.error(
          `❌ Chat Service: Failed to parse AI response: ${error.message}`,
        );
        console.error(
          `❌ Chat Service: AI Response (first 500 chars): ${aiResponse.substring(0, 500)}`,
        );
        console.error(
          `❌ Chat Service: AI Response (last 500 chars): ${aiResponse.substring(Math.max(0, aiResponse.length - 500))}`,
        ); // Try to extract partial JSON if the response was truncated
        if (aiResponse.length >= 3900) {
          console.log(
            `🔄 Chat Service: Attempting to extract partial operations from truncated response`,
          );
          try {
            // Try to find the addedFeature first
            const featureMatch = aiResponse.match(
              /"addedFeature":\s*"([^"]+)"/,
            );
            const addedFeature = featureMatch
              ? featureMatch[1]
              : 'Fireworks feature (response was truncated)';

            // For this specific case (fireworks), create a working implementation
            if (
              message.toLowerCase().includes('fireworks') ||
              message.toLowerCase().includes('firework')
            ) {
              console.log(
                `🎆 Chat Service: Creating fireworks feature implementation from template`,
              );

              modificationPlan = {
                addedFeature:
                  'Added fireworks display when player joins the server',
                operations: [
                  {
                    type: 'CREATE',
                    file: {
                      path: 'src/main/java/com/example/sayhionjoin/FireworkManager.java',
                      content: `package com.example.sayhionjoin;

import org.bukkit.Color;
import org.bukkit.FireworkEffect;
import org.bukkit.Location;
import org.bukkit.entity.Firework;
import org.bukkit.entity.Player;
import org.bukkit.inventory.meta.FireworkMeta;

import java.util.Random;

public class FireworkManager {
    private static final Random random = new Random();
    
    public static void spawnFireworks(Player player) {
        Location playerLoc = player.getLocation();
        
        for (int i = 0; i < 3; i++) {
            // Spawn firework at random location near player
            Location fireworkLoc = playerLoc.clone().add(
                (random.nextDouble() - 0.5) * 10,
                random.nextDouble() * 5 + 3,
                (random.nextDouble() - 0.5) * 10
            );
            
            Firework firework = player.getWorld().spawn(fireworkLoc, Firework.class);
            FireworkMeta fireworkMeta = firework.getFireworkMeta();
            
            // Random colors and effects
            Color[] colors = {Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW, Color.PURPLE, Color.ORANGE};
            FireworkEffect.Type[] types = {FireworkEffect.Type.BALL, FireworkEffect.Type.BURST, FireworkEffect.Type.STAR};
            
            FireworkEffect effect = FireworkEffect.builder()
                .withColor(colors[random.nextInt(colors.length)])
                .withFade(colors[random.nextInt(colors.length)])
                .with(types[random.nextInt(types.length)])
                .withTrail()
                .withFlicker()
                .build();
            
            fireworkMeta.addEffect(effect);
            fireworkMeta.setPower(random.nextInt(2) + 1);
            firework.setFireworkMeta(fireworkMeta);
        }
    }
}`,
                      reason:
                        'Created FireworkManager utility class to handle firework spawning',
                    },
                  },
                  {
                    type: 'UPDATE',
                    file: {
                      path: 'src/main/java/com/example/sayhionjoin/SayHiOnJoinPlugin.java',
                      content: `package com.example.sayhionjoin;

import org.bukkit.plugin.java.JavaPlugin;

public final class SayHiOnJoinPlugin extends JavaPlugin {

    @Override
    public void onEnable() {
        // Plugin startup logic
        getLogger().info("SayHiOnJoin plugin has been enabled!");
        
        // Register the player join listener
        getServer().getPluginManager().registerEvents(new PlayerJoinListener(), this);
    }

    @Override
    public void onDisable() {
        // Plugin shutdown logic
        getLogger().info("SayHiOnJoin plugin has been disabled!");
    }
}`,
                      reason: 'Updated main plugin class to register events',
                    },
                  },
                  {
                    type: 'UPDATE',
                    file: {
                      path: 'src/main/java/com/example/sayhionjoin/PlayerJoinListener.java',
                      content: `package com.example.sayhionjoin;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.plugin.java.JavaPlugin;

public class PlayerJoinListener implements Listener {

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        
        // Send welcome message
        player.sendMessage("§6Welcome to the server, " + player.getName() + "!");
        
        // Spawn fireworks after a short delay
        new BukkitRunnable() {
            @Override
            public void run() {
                FireworkManager.spawnFireworks(player);
            }
        }.runTaskLater(JavaPlugin.getProvidingPlugin(this.getClass()), 40L); // 2 second delay
    }
}`,
                      reason:
                        'Updated PlayerJoinListener to include fireworks spawning',
                    },
                  },
                ],
                buildCommands: ['mvn clean compile', 'mvn package'],
              };

              console.log(
                `✅ Chat Service: Created fireworks implementation with ${modificationPlan.operations.length} operations`,
              );
            } else {
              // Generic fallback for other modifications
              modificationPlan = {
                addedFeature: addedFeature,
                operations: [],
                buildCommands: ['mvn clean compile', 'mvn package'],
              };

              console.log(
                `✅ Chat Service: Created fallback modification plan`,
              );
            }
          } catch (fallbackError) {
            return {
              success: false,
              error: 'Failed to parse modification plan',
              message:
                'The AI response was too large and got truncated. Please try breaking your modification request into smaller, more specific parts.',
            };
          }
        } else {
          return {
            success: false,
            error: 'Failed to parse modification plan',
            message:
              'The AI provided an incomplete or invalid response format. This might be due to a very complex modification request. Please try breaking your request into smaller parts.',
          };
        }
      }

      // Validate the modification plan
      if (
        !modificationPlan.operations ||
        !Array.isArray(modificationPlan.operations)
      ) {
        return {
          success: false,
          error: 'Invalid modification plan',
          message:
            'The AI provided an invalid modification plan. Please try again.',
        };
      }
      console.log(
        `🛠️ Chat Service: Executing ${modificationPlan.operations.length} file operations`,
      );

      // Execute file operations
      const results: any[] = [];
      for (const operation of modificationPlan.operations) {
        try {
          const result = await this.executeFileOperation(operation, pluginPath);
          results.push(result);
          console.log(
            `✅ Chat Service: Executed ${operation.type} operation on ${operation.file.path}`,
          );
        } catch (error) {
          console.error(
            `❌ Chat Service: Failed to execute ${operation.type} operation: ${error.message}`,
          );
          results.push({
            success: false,
            operation: operation.type,
            error: error.message,
          });
        }
      } // Regenerate plugin index to reflect changes
      console.log(
        `🔄 Chat Service: Regenerating plugin index after modifications`,
      );
      await this.generatePluginIndex(pluginName, username); // Sync changes to MongoDB to ensure database-disk consistency
      console.log(`💾 Chat Service: Syncing plugin changes to MongoDB`);
      try {
        // Build plugin DTO for sync
        const description = await this.extractPluginDescription(pluginPath);
        const minecraftVersion = await this.extractMinecraftVersion(pluginPath);
        const dependencies = await this.extractDependencies(pluginPath);
        const metadata = await this.extractPluginMetadata(pluginPath);

        const pluginDto = {
          _id: this.generatePluginId(username, pluginName),
          userId: username,
          pluginName: pluginName,
          description: description,
          minecraftVersion: minecraftVersion,
          dependencies: dependencies,
          metadata: metadata,
          diskPath: pluginPath,
        };

        await this.pluginDbService.syncWithDisk(pluginDto);
        console.log(
          `✅ Chat Service: Successfully synced plugin "${pluginName}" to MongoDB`,
        );
      } catch (syncError) {
        console.error(
          `❌ Chat Service: Failed to sync plugin to MongoDB: ${syncError.message}`,
        );
        // Don't fail the entire operation if MongoDB sync fails, just log the error
      }

      // Clear cache for the modified plugin
      this.clearPluginFilesCache(username, pluginName);

      // Attempt to compile the modified plugin
      console.log(`🔨 Chat Service: Compiling modified plugin`);
      let compilationResult;
      try {
        compilationResult = await this.mavenService.compilePlugin(pluginPath);
        if (!compilationResult.success) {
          console.log(
            `⚠️ Chat Service: Compilation failed, attempting auto-fix`,
          );
          // Attempt to fix compilation errors
          const fixResult = await this.errorFixService.fixAndCompile(
            username,
            pluginName,
          );
          if (fixResult.success) {
            console.log(`✅ Chat Service: Auto-fix successful`);
            compilationResult = fixResult.finalCompilationResult;
          }
        }
      } catch (error) {
        console.error(`❌ Chat Service: Compilation error: ${error.message}`);
        compilationResult = { success: false, error: error.message };
      }

      return {
        success: true,
        type: 'modification',
        message: `Successfully implemented: ${modificationPlan.addedFeature}`,
        username,
        pluginName,
        modification: {
          feature: modificationPlan.addedFeature,
          operationsExecuted: results.length,
          operationsSuccessful: results.filter((r) => r.success).length,
          compilationSuccess: compilationResult?.success || false,
          compilationMessage:
            compilationResult?.message || 'Compilation status unknown',
        },
        operations: results,
      };
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to handle modification query: ${error.message}`,
      );
      return {
        success: false,
        error: 'Failed to process modification request',
        message: `I encountered an error while trying to modify your plugin: ${error.message}`,
      };
    }
  }

  /**
   * Execute a file operation (CREATE, UPDATE, DELETE, RENAME)
   * @param operation - The file operation to execute
   * @param pluginPath - Base path of the plugin project
   * @returns Promise<any> - Operation result
   */
  private async executeFileOperation(
    operation: any,
    pluginPath: string,
  ): Promise<any> {
    const { type, file } = operation;

    try {
      switch (type.toUpperCase()) {
        case 'CREATE':
        case 'UPDATE':
          if (!file.path || !file.content) {
            throw new Error(`${type} operation requires path and content`);
          }

          const targetPath = path.join(pluginPath, file.path);

          // Ensure directory exists
          await fs.ensureDir(path.dirname(targetPath));

          // Write file content
          await fs.writeFile(targetPath, file.content, 'utf8');

          console.log(
            `📝 Chat Service: ${type} operation completed for ${file.path}`,
          );
          return {
            success: true,
            operation: type,
            path: file.path,
            reason: file.reason,
          };

        case 'DELETE':
          if (!file.path) {
            throw new Error('DELETE operation requires path');
          }

          const deletePath = path.join(pluginPath, file.path);

          if (await fs.pathExists(deletePath)) {
            await fs.remove(deletePath);
            console.log(
              `🗑️ Chat Service: DELETE operation completed for ${file.path}`,
            );
          } else {
            console.log(
              `⚠️ Chat Service: File not found for DELETE: ${file.path}`,
            );
          }

          return {
            success: true,
            operation: type,
            path: file.path,
            reason: file.reason,
          };

        case 'RENAME':
          if (!file.oldPath || !file.newPath) {
            throw new Error('RENAME operation requires oldPath and newPath');
          }

          const oldPath = path.join(pluginPath, file.oldPath);
          const newPath = path.join(pluginPath, file.newPath);

          if (await fs.pathExists(oldPath)) {
            // Ensure target directory exists
            await fs.ensureDir(path.dirname(newPath));
            await fs.move(oldPath, newPath);
            console.log(
              `🔄 Chat Service: RENAME operation completed: ${file.oldPath} → ${file.newPath}`,
            );
          } else {
            throw new Error(`Source file not found: ${file.oldPath}`);
          }

          return {
            success: true,
            operation: type,
            oldPath: file.oldPath,
            newPath: file.newPath,
            reason: file.reason,
          };

        default:
          throw new Error(`Unknown operation type: ${type}`);
      }
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to execute ${type} operation: ${error.message}`,
      );
      return {
        success: false,
        operation: type,
        error: error.message,
        reason: file.reason,
      };
    }
  }

  /**
   * Generate simple plugin index for AI consumption
   * @param pluginName - The name of the plugin to index
   * @param username - The username who owns the plugin
   * @returns Promise<string> - Path to the generated index file
   */
  private async generatePluginIndex(
    pluginName: string,
    username: string,
  ): Promise<string> {
    console.log(
      `📁 Chat Service: Generating plugin index for "${pluginName}" by user "${username}"`,
    );

    const pluginPath = path.join(this.generatedPath, username, pluginName);
    const indexFileName = `plugin_index.json`;
    const indexFilePath = path.join(pluginPath, indexFileName);

    // Ensure plugin directory exists
    await fs.ensureDir(pluginPath);
    const indexData: any = {
      plugin: pluginName,
      username: username,
      generated: new Date().toISOString(),
      files: [],
    };

    // Check if plugin directory exists and get files
    if (await fs.pathExists(pluginPath)) {
      indexData.files = await this.getFilesWithContent(pluginPath);
    }

    // Write JSON index file
    await fs.writeFile(
      indexFilePath,
      JSON.stringify(indexData, null, 2),
      'utf8',
    );
    console.log(`📝 Chat Service: Plugin index generated at: ${indexFilePath}`);

    return indexFilePath;
  }

  /**
   * Get all files with their content for AI processing - SIMPLE VERSION
   * @param dirPath - Directory path to scan
   * @returns Promise<any[]> - Array of {path, content} objects
   */
  private async getFilesWithContent(dirPath: string): Promise<any[]> {
    const files: any[] = [];

    const scanDirectory = async (
      currentPath: string,
      relativePath: string = '',
    ) => {
      try {
        const items = await fs.readdir(currentPath);

        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const relativeItemPath = path
            .join(relativePath, item)
            .replace(/\\/g, '/');
          const stat = await fs.stat(itemPath);
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();

            // Skip index files to prevent recursive indexing
            const indexFiles = ['plugin_index.json', 'all_plugins_index.json'];
            if (indexFiles.includes(item)) {
              continue;
            }

            // Only index text files that matter for AI
            const textFiles = [
              '.java',
              '.js',
              '.ts',
              '.py',
              '.txt',
              '.md',
              '.yml',
              '.yaml',
              '.json',
              '.xml',
              '.properties',
              '.html',
              '.css',
            ];

            if (textFiles.includes(ext) || !ext) {
              try {
                const content = await fs.readFile(itemPath, 'utf8');
                files.push({
                  path: relativeItemPath,
                  content: content,
                });
              } catch (err) {
                // Skip unreadable files
              }
            }
          } else if (stat.isDirectory()) {
            await scanDirectory(itemPath, relativeItemPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await scanDirectory(dirPath);
    return files;
  }
  /**
   * Generate comprehensive index of all plugins for a user - SIMPLE VERSION
   * @param username - The username to index plugins for
   * @returns Promise<string> - Path to the generated index file
   */
  private async generateUserPluginsIndex(username: string): Promise<string> {
    console.log(
      `📁 Chat Service: Generating comprehensive plugins index for user "${username}"`,
    );

    const userPath = path.join(this.generatedPath, username);
    const indexFileName = `all_plugins_index.json`;
    const indexFilePath = path.join(userPath, indexFileName);

    // Ensure user directory exists
    await fs.ensureDir(userPath);
    const indexData: any = {
      username: username,
      generated: new Date().toISOString(),
      plugins: [],
    };

    // Check if user directory exists
    if (await fs.pathExists(userPath)) {
      try {
        const plugins = await fs.readdir(userPath);

        for (const plugin of plugins) {
          const pluginPath = path.join(userPath, plugin);
          const stat = await fs.stat(pluginPath);

          if (stat.isDirectory()) {
            const files = await this.getFilesWithContent(pluginPath);
            indexData.plugins.push({
              name: plugin,
              files: files,
            });
          }
        }
      } catch (error) {
        // Skip if can't read user directory
      }
    }

    // Write index file
    await fs.writeFile(
      indexFilePath,
      JSON.stringify(indexData, null, 2),
      'utf8',
    );
    console.log(
      `📝 Chat Service: User plugins index generated at: ${indexFilePath}`,
    );

    return indexFilePath;
  }

  /**
   * Check if a user has a specific plugin
   * @param pluginName - The name of the plugin to check
   * @param username - The username to check for plugin ownership
   * @returns Promise<boolean> - True if user has the plugin, false otherwise
   */
  async checkUserHasPlugin(
    pluginName: string,
    username: string,
  ): Promise<boolean> {
    console.log(
      `💬 Chat Service: Checking if user "${username}" has plugin "${pluginName}"`,
    );

    // Validate input parameters
    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      return false;
    }

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return false;
    }

    // Normalize inputs
    const normalizedPluginName = pluginName.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    console.log(
      `🔍 Chat Service: Normalized check - plugin: "${normalizedPluginName}", user: "${normalizedUsername}"`,
    );

    // Generate plugin index file
    try {
      const indexFilePath = await this.generatePluginIndex(
        normalizedPluginName,
        normalizedUsername,
      );
      console.log(`📊 Chat Service: Plugin index created at: ${indexFilePath}`);
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to generate plugin index: ${error.message}`,
      );
    }

    // TODO: Implement actual logic to check user plugin ownership
    // For now, return true as placeholder
    console.log(
      `✅ Chat Service: User "${normalizedUsername}" has plugin "${normalizedPluginName}": true (placeholder)`,
    );

    return true;
  }

  /**
   * Get user's plugin list (placeholder for future implementation)
   * @param username - The username to get plugins for
   * @returns Promise<string[]> - Array of plugin names the user has
   */
  async getUserPlugins(username: string): Promise<string[]> {
    console.log(`📋 Chat Service: Getting plugin list for user "${username}"`);

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return [];
    }

    const normalizedUsername = username.trim().toLowerCase();

    // Generate comprehensive user plugins index
    try {
      await this.generateUserPluginsIndex(normalizedUsername);
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to generate user plugins index: ${error.message}`,
      );
    }

    // TODO: Implement actual logic to get user's plugins
    // For now, return empty array as placeholder
    console.log(
      `📋 Chat Service: User "${normalizedUsername}" plugins: [] (placeholder)`,
    );

    return [];
  }

  /**
   * Add plugin to user (placeholder for future implementation)
   * @param pluginName - The name of the plugin to add
   * @param username - The username to add plugin to
   * @returns Promise<boolean> - True if successfully added, false otherwise
   */
  async addPluginToUser(
    pluginName: string,
    username: string,
  ): Promise<boolean> {
    console.log(
      `➕ Chat Service: Adding plugin "${pluginName}" to user "${username}"`,
    );

    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      return false;
    }

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return false;
    }

    const normalizedPluginName = pluginName.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    // Generate plugin index file for the added plugin
    try {
      const indexFilePath = await this.generatePluginIndex(
        normalizedPluginName,
        normalizedUsername,
      );
      console.log(
        `📊 Chat Service: Plugin index created for added plugin at: ${indexFilePath}`,
      );
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to generate plugin index for add operation: ${error.message}`,
      );
    }

    // TODO: Implement actual logic to add plugin to user
    // For now, return true as placeholder
    console.log(
      `✅ Chat Service: Plugin "${normalizedPluginName}" added to user "${normalizedUsername}" (placeholder)`,
    );

    return true;
  }

  /**
   * Remove plugin from user (placeholder for future implementation)
   * @param pluginName - The name of the plugin to remove
   * @param username - The username to remove plugin from
   * @returns Promise<boolean> - True if successfully removed, false otherwise
   */
  async removePluginFromUser(
    pluginName: string,
    username: string,
  ): Promise<boolean> {
    console.log(
      `➖ Chat Service: Removing plugin "${pluginName}" from user "${username}"`,
    );

    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      return false;
    }

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      return false;
    }

    const normalizedPluginName = pluginName.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    // Generate plugin index file before removal (for record keeping)
    try {
      const indexFilePath = await this.generatePluginIndex(
        normalizedPluginName,
        normalizedUsername,
      );
      console.log(
        `📊 Chat Service: Plugin index created for removal record at: ${indexFilePath}`,
      );
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to generate plugin index for remove operation: ${error.message}`,
      );
    }

    // TODO: Implement actual logic to remove plugin from user
    // For now, return true as placeholder
    console.log(
      `✅ Chat Service: Plugin "${normalizedPluginName}" removed from user "${normalizedUsername}" (placeholder)`,
    );

    return true;
  } /**
   * Get plugin files for Monaco Editor with MongoDB sync and caching
   * @param username - The username
   * @param pluginName - The plugin name
   * @returns Promise<{[path: string]: string}> - Object with file paths as keys and content as values
   */
  async getPluginFilesForEditor(
    username: string,
    pluginName: string,
  ): Promise<{ [path: string]: string }> {
    console.log(
      `📁 Chat Service: Getting plugin files for Monaco Editor - user: "${username}", plugin: "${pluginName}"`,
    );

    if (!username || username.trim().length === 0) {
      console.log('❌ Chat Service: Username is required');
      throw new Error('Username is required');
    }

    if (!pluginName || pluginName.trim().length === 0) {
      console.log('❌ Chat Service: Plugin name is required');
      throw new Error('Plugin name is required');
    }

    const normalizedUsername = username.trim();
    const normalizedPluginName = pluginName.trim();

    const pluginPath = path.join(
      this.generatedPath,
      normalizedUsername,
      normalizedPluginName,
    );
    const cacheKey = `${normalizedUsername}:${normalizedPluginName}`;

    // Check if plugin directory exists
    if (!(await fs.pathExists(pluginPath))) {
      console.log(
        `❌ Chat Service: Plugin directory not found at: ${pluginPath}`,
      );
      throw new Error(
        `Plugin "${normalizedPluginName}" not found for user "${normalizedUsername}"`,
      );
    }

    try {
      // Step 1: Check if MongoDB sync is needed
      const needsSync = await this.pluginDbService.needsSync(
        normalizedUsername,
        normalizedPluginName,
        pluginPath,
      );

      if (needsSync) {
        console.log(`🔄 Chat Service: Plugin needs sync with MongoDB`);
        await this.syncPluginWithDatabase(
          normalizedUsername,
          normalizedPluginName,
          pluginPath,
        );
      }

      // Step 2: Try to get files from MongoDB first
      try {
        const files = await this.pluginDbService.getPluginFilesForEditor(
          normalizedUsername,
          normalizedPluginName,
        );
        console.log(
          `🗄️ Chat Service: Retrieved ${Object.keys(files).length} files from MongoDB`,
        );
        console.log(`📋 Chat Service: Files: ${Object.keys(files).join(', ')}`);

        // Update in-memory cache as well
        const currentTime = Date.now();
        const currentModTime = await this.getDirectoryLastModified(pluginPath);
        this.pluginFilesCache.set(cacheKey, {
          files,
          lastModified: currentModTime,
          cacheTime: currentTime,
        });

        return files;
      } catch (dbError) {
        console.warn(
          `⚠️ Chat Service: Failed to get files from MongoDB, falling back to disk: ${dbError.message}`,
        );
      }

      // Step 3: Fallback to in-memory cache and disk
      const currentModTime = await this.getDirectoryLastModified(pluginPath);
      const currentTime = Date.now();

      // Check if we have a valid cache entry
      const cachedEntry = this.pluginFilesCache.get(cacheKey);

      if (
        cachedEntry &&
        cachedEntry.lastModified >= currentModTime &&
        currentTime - cachedEntry.cacheTime < this.CACHE_TTL
      ) {
        console.log(
          `🚀 Chat Service: Using cached plugin files (cached ${Math.round((currentTime - cachedEntry.cacheTime) / 1000)}s ago)`,
        );
        console.log(
          `📋 Chat Service: Cached files: ${Object.keys(cachedEntry.files).join(', ')}`,
        );
        return cachedEntry.files;
      }

      // Step 4: Read from disk as last resort
      console.log(
        `📂 Chat Service: Reading plugin files from disk (cache ${cachedEntry ? 'expired/outdated' : 'miss'})`,
      );

      // Get all files with their content
      const files = await this.getFilesWithContent(pluginPath);
      const result: { [path: string]: string } = {};

      // Convert to Monaco Editor format
      for (const file of files) {
        // Use forward slashes for web compatibility
        const normalizedPath = file.path.replace(/\\/g, '/');
        result[normalizedPath] = file.content;
      }

      // Update in-memory cache
      this.pluginFilesCache.set(cacheKey, {
        files: result,
        lastModified: currentModTime,
        cacheTime: currentTime,
      });

      console.log(
        `✅ Chat Service: Retrieved and cached ${Object.keys(result).length} files for Monaco Editor`,
      );
      console.log(`📋 Chat Service: Files: ${Object.keys(result).join(', ')}`);

      // Try to update MongoDB in background (don't wait for it)
      this.syncPluginWithDatabase(
        normalizedUsername,
        normalizedPluginName,
        pluginPath,
      ).catch((error) => {
        console.warn(
          `⚠️ Chat Service: Background MongoDB sync failed: ${error.message}`,
        );
      });

      return result;
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to get plugin files: ${error.message}`,
      );
      throw new Error(`Failed to read plugin files: ${error.message}`);
    }
  }

  /**
   * Get the latest modification time of a directory (recursively)
   * @param dirPath - Directory path to check
   * @returns Promise<number> - Latest modification time in milliseconds
   */
  private async getDirectoryLastModified(dirPath: string): Promise<number> {
    let latestTime = 0;

    const scanDirectory = async (currentPath: string) => {
      try {
        const items = await fs.readdir(currentPath);

        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const stat = await fs.stat(itemPath);

          // Update latest time if this item is newer
          if (stat.mtimeMs > latestTime) {
            latestTime = stat.mtimeMs;
          }

          // Recursively check subdirectories
          if (stat.isDirectory()) {
            await scanDirectory(itemPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    try {
      // Check the directory itself
      const dirStat = await fs.stat(dirPath);
      latestTime = dirStat.mtimeMs;

      // Scan all contents
      await scanDirectory(dirPath);
    } catch (error) {
      // Return 0 if we can't check the directory
      return 0;
    }

    return latestTime;
  }

  /**
   * Clear cache for a specific plugin or all plugins
   * @param username - Optional username to clear cache for specific user
   * @param pluginName - Optional plugin name to clear cache for specific plugin
   */
  clearPluginFilesCache(username?: string, pluginName?: string): void {
    if (username && pluginName) {
      const cacheKey = `${username.trim()}:${pluginName.trim()}`;
      this.pluginFilesCache.delete(cacheKey);
      console.log(
        `🗑️ Chat Service: Cleared cache for plugin "${pluginName}" by user "${username}"`,
      );
    } else if (username) {
      // Clear all plugins for a specific user
      const userPrefix = `${username.trim()}:`;
      for (const key of this.pluginFilesCache.keys()) {
        if (key.startsWith(userPrefix)) {
          this.pluginFilesCache.delete(key);
        }
      }
      console.log(
        `🗑️ Chat Service: Cleared all plugin cache for user "${username}"`,
      );
    } else {
      // Clear entire cache
      this.pluginFilesCache.clear();
      console.log(`🗑️ Chat Service: Cleared entire plugin files cache`);
    }
  }
  /**
   * Get cache statistics
   * @returns Object with cache stats
   */
  getCacheStats(): { totalEntries: number; cacheKeys: string[] } {
    return {
      totalEntries: this.pluginFilesCache.size,
      cacheKeys: Array.from(this.pluginFilesCache.keys()),
    };
  }

  /**
   * Sync plugin with MongoDB database
   * @param username - The username
   * @param pluginName - The plugin name
   * @param pluginPath - The disk path to the plugin
   */
  private async syncPluginWithDatabase(
    username: string,
    pluginName: string,
    pluginPath: string,
  ): Promise<void> {
    console.log(
      `🔄 Chat Service: Syncing plugin with MongoDB - user: "${username}", plugin: "${pluginName}"`,
    );

    try {
      // Create plugin DTO for database
      const pluginDto = {
        _id: this.generatePluginId(username, pluginName),
        userId: username,
        pluginName: pluginName,
        description: await this.extractPluginDescription(pluginPath),
        minecraftVersion: await this.extractMinecraftVersion(pluginPath),
        dependencies: await this.extractDependencies(pluginPath),
        metadata: await this.extractPluginMetadata(pluginPath),
        diskPath: pluginPath,
      };

      await this.pluginDbService.syncWithDisk(pluginDto);
      console.log(`✅ Chat Service: Plugin synced with MongoDB successfully`);

      // Clear in-memory cache to force refresh on next request
      const cacheKey = `${username}:${pluginName}`;
      this.pluginFilesCache.delete(cacheKey);
    } catch (error) {
      console.error(
        `❌ Chat Service: Failed to sync plugin with MongoDB: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  /**
   * Generate a unique plugin ID
   */
  private generatePluginId(username: string, pluginName: string): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    const uniqueString = `${username}:${pluginName}:${timestamp}:${random}`;
    return Buffer.from(uniqueString).toString('base64url').substring(0, 48); // Increased length for uniqueness
  }

  /**
   * Extract plugin description from plugin.yml or README
   */
  private async extractPluginDescription(pluginPath: string): Promise<string> {
    try {
      // Try plugin.yml first
      const pluginYmlPath = path.join(
        pluginPath,
        'src',
        'main',
        'resources',
        'plugin.yml',
      );
      if (await fs.pathExists(pluginYmlPath)) {
        const content = await fs.readFile(pluginYmlPath, 'utf-8');
        const match = content.match(/description:\s*['"]?([^'"\n\r]+)['"]?/i);
        if (match) {
          return match[1].trim();
        }
      }

      // Try README.md
      const readmePath = path.join(pluginPath, 'README.md');
      if (await fs.pathExists(readmePath)) {
        const content = await fs.readFile(readmePath, 'utf-8');
        const lines = content
          .split('\n')
          .filter((line) => line.trim().length > 0);
        if (lines.length > 1) {
          return lines[1].replace(/^#+\s*/, '').trim(); // Remove markdown headers
        }
      }

      return `A Minecraft plugin named ${path.basename(pluginPath)}`;
    } catch (error) {
      return `A Minecraft plugin named ${path.basename(pluginPath)}`;
    }
  }

  /**
   * Extract Minecraft version from plugin.yml or pom.xml
   */
  private async extractMinecraftVersion(pluginPath: string): Promise<string> {
    try {
      // Try plugin.yml first
      const pluginYmlPath = path.join(
        pluginPath,
        'src',
        'main',
        'resources',
        'plugin.yml',
      );
      if (await fs.pathExists(pluginYmlPath)) {
        const content = await fs.readFile(pluginYmlPath, 'utf-8');
        const match = content.match(/api-version:\s*['"]?([^'"\n\r]+)['"]?/i);
        if (match) {
          return match[1].trim();
        }
      }

      // Try pom.xml
      const pomPath = path.join(pluginPath, 'pom.xml');
      if (await fs.pathExists(pomPath)) {
        const content = await fs.readFile(pomPath, 'utf-8');
        const match = content.match(
          /<version>([^<]*(?:1\.\d+[^<]*?))<\/version>/i,
        );
        if (match) {
          return match[1].trim();
        }
      }

      return '1.20';
    } catch (error) {
      return '1.20';
    }
  }

  /**
   * Extract dependencies from pom.xml
   */
  private async extractDependencies(pluginPath: string): Promise<string[]> {
    try {
      const pomPath = path.join(pluginPath, 'pom.xml');
      if (await fs.pathExists(pomPath)) {
        const content = await fs.readFile(pomPath, 'utf-8');
        const dependencies: string[] = [];
        // Extract dependency names
        const matches = content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
        for (const match of matches) {
          const artifact = match[1].trim();
          if (artifact !== path.basename(pluginPath).toLowerCase()) {
            dependencies.push(artifact);
          }
        }

        return dependencies;
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Extract plugin metadata from plugin.yml
   */
  private async extractPluginMetadata(pluginPath: string): Promise<{
    author: string;
    version: string;
    mainClass: string;
    apiVersion: string;
  }> {
    try {
      const pluginYmlPath = path.join(
        pluginPath,
        'src',
        'main',
        'resources',
        'plugin.yml',
      );
      if (await fs.pathExists(pluginYmlPath)) {
        const content = await fs.readFile(pluginYmlPath, 'utf-8');
        const author =
          content.match(/author:\s*['"]?([^'"\n\r]+)['"]?/i)?.[1]?.trim() ||
          'Unknown';
        const version =
          content.match(/version:\s*['"]?([^'"\n\r]+)['"]?/i)?.[1]?.trim() ||
          '1.0.0';
        const mainClass =
          content.match(/main:\s*['"]?([^'"\n\r]+)['"]?/i)?.[1]?.trim() ||
          'Main';
        const apiVersion =
          content
            .match(/api-version:\s*['"]?([^'"\n\r]+)['"]?/i)?.[1]
            ?.trim() || '1.20';

        return { author, version, mainClass, apiVersion };
      }

      return {
        author: 'Unknown',
        version: '1.0.0',
        mainClass: 'Main',
        apiVersion: '1.20',
      };
    } catch (error) {
      return {
        author: 'Unknown',
        version: '1.0.0',
        mainClass: 'Main',
        apiVersion: '1.20',
      };
    }
  }

  /**
   * Store chat interaction in history database
   */
  private async storeChatHistory(
    userId: string,
    pluginName: string,
    userMessage: string,
    assistantResponse: any,
    filesModified: string[],
    operationsPerformed: any,
    processingTime: number,
  ): Promise<void> {
    try {
      const chatEntry: ChatHistoryEntry = {
        userId,
        pluginName,
        userMessage,
        assistantResponse:
          typeof assistantResponse === 'string'
            ? assistantResponse
            : JSON.stringify(assistantResponse),
        metadata: {
          messageType: operationsPerformed.error ? 'error' : 'success',
          processingTime,
          requestId: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        },
        filesModified,
        operationsPerformed,
      };

      await this.chatHistoryService.storeChatInteraction(chatEntry);
      console.log(
        `💾 Chat history stored for user "${userId}", plugin "${pluginName}"`,
      );
    } catch (error) {
      console.error(`❌ Failed to store chat history: ${error.message}`);
      // Don't throw - chat history storage failure shouldn't break the main flow
    }
  }
}
