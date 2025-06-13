import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiService } from './ai.service';
import { MavenService } from './maven.service';
import { DiskReaderService } from './disk-reader.service';
import { ErrorFixService } from './error-fix.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, AiService, MavenService, DiskReaderService, ErrorFixService],
})
export class AppModule {}
