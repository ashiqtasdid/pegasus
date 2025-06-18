import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  console.log('🚀 Starting Pegasus Plugin Generator...');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`💻 Platform: ${process.platform}`);
  console.log(`🔧 Node.js version: ${process.version}`);
  console.log(`📂 Working directory: ${process.cwd()}`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  console.log(`✅ NestJS application created successfully`);
  // Enable CORS for frontend development
  app.enableCors();
  console.log('✅ CORS enabled for frontend development');

  // Serve static files from public directory
  // In development: __dirname is dist/src, so we go up two levels
  // In Docker: __dirname is /app/dist/src, so we go to /app/public
  const publicPath =
    process.env.NODE_ENV === 'production'
      ? join(process.cwd(), 'public')
      : join(__dirname, '..', '..', 'public');

  app.useStaticAssets(publicPath);
  console.log(`📁 Static files enabled from: ${publicPath}`);

  // Check if generated directory exists
  const generatedDir = join(process.cwd(), 'generated');
  try {
    await require('fs-extra').ensureDir(generatedDir);
    console.log(`📁 Generated directory ready: ${generatedDir}`);
  } catch (error) {
    console.error(`❌ Failed to create generated directory: ${error.message}`);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🌐 Application is running on: http://localhost:${port}`);
  console.log(`🎮 Web UI available at: http://localhost:${port}/app`);
  console.log(`📚 API documentation: Check API.md file`);
  console.log('⚡ Ready to generate Minecraft plugins!');
  console.log('🎯 All services initialized and ready for requests');
}
bootstrap();

// Process monitoring and graceful shutdown
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT (Ctrl+C), shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Log memory usage periodically in development
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const formatMB = (bytes: number) =>
      Math.round((bytes / 1024 / 1024) * 100) / 100;

    console.log(
      `📊 Memory Usage: RSS=${formatMB(memUsage.rss)}MB, Heap=${formatMB(memUsage.heapUsed)}/${formatMB(memUsage.heapTotal)}MB, External=${formatMB(memUsage.external)}MB`,
    );
  }, 60000); // Every minute
}
