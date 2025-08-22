import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReceiptModule } from './modules/receipt/receipt.module';
import { AiModule } from './modules/ai/ai.module';
import { StorageModule } from './modules/storage/storage.module';
import { Receipt } from './modules/receipt/entities/receipt.entity';

@Module({
  imports: [
    // Configuration module for environment variables
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    
    // Database configuration
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'receipts.db',
      entities: [Receipt], // Explicitly include our Receipt entity
      synchronize: true, // Only for development - disable in production
      logging: true, // Enable SQL logging for development
    }),
    
    // File upload configuration
    MulterModule.register({
      dest: './uploads',
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
    
    // Feature modules
    ReceiptModule,
    AiModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
