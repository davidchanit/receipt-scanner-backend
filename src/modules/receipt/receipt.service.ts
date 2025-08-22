import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptResponseDto } from './dto/receipt.dto';
import { AiService, ExtractedReceiptData } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    @InjectRepository(Receipt)
    private receiptRepository: Repository<Receipt>,
    private aiService: AiService,
    private storageService: StorageService,
  ) {}

  async extractReceiptDetails(imageFile: Express.Multer.File): Promise<ReceiptResponseDto> {
    this.logger.log(`Starting receipt extraction for file: ${imageFile.originalname}`);
    
    try {
      // Validate file type
      if (!this.isValidImageFile(imageFile)) {
        throw new BadRequestException('Invalid file type. Only .jpg, .jpeg, .png files are allowed.');
      }

      // Save image to storage
      const imageUrl = await this.storageService.saveImage(imageFile);
      this.logger.log(`Image saved to: ${imageUrl}`);

      // Extract receipt details using AI
      const extractedData = await this.aiService.extractReceiptData(imageFile.buffer);
      this.logger.log(`AI extraction completed for vendor: ${extractedData.vendor_name}`);

      // Validate AI response
      if (!this.isValidAiResponse(extractedData)) {
        // Clean up saved image if AI extraction failed
        await this.storageService.deleteImage(imageUrl);
        throw new InternalServerErrorException('AI model returned invalid or incomplete data.');
      }

      // Create receipt entity
      const receipt = this.receiptRepository.create({
        date: extractedData.date,
        currency: extractedData.currency,
        vendor_name: extractedData.vendor_name,
        receipt_items: JSON.stringify(extractedData.receipt_items),
        tax: extractedData.tax,
        total: extractedData.total,
        image_url: imageUrl,
      });

      // Save to database
      const savedReceipt = await this.receiptRepository.save(receipt);
      this.logger.log(`Receipt saved to database with ID: ${savedReceipt.id}`);

      return this.mapToResponseDto(savedReceipt);
    } catch (error) {
      this.logger.error('Receipt extraction failed', error);
      
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to extract receipt details.');
    }
  }

  async getReceiptById(id: string): Promise<ReceiptResponseDto> {
    try {
      const receipt = await this.receiptRepository.findOne({ where: { id } });
      
      if (!receipt) {
        throw new BadRequestException(`Receipt with ID ${id} not found.`);
      }

      return this.mapToResponseDto(receipt);
    } catch (error) {
      this.logger.error(`Failed to get receipt by ID: ${id}`, error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to retrieve receipt.');
    }
  }

  async getAllReceipts(): Promise<ReceiptResponseDto[]> {
    try {
      const receipts = await this.receiptRepository.find({
        order: { created_at: 'DESC' },
      });

      return receipts.map(receipt => this.mapToResponseDto(receipt));
    } catch (error) {
      this.logger.error('Failed to get all receipts', error);
      throw new InternalServerErrorException('Failed to retrieve receipts.');
    }
  }

  async deleteReceipt(id: string): Promise<void> {
    try {
      const receipt = await this.receiptRepository.findOne({ where: { id } });
      
      if (!receipt) {
        throw new BadRequestException(`Receipt with ID ${id} not found.`);
      }

      // Delete the image file
      await this.storageService.deleteImage(receipt.image_url);

      // Delete from database
      await this.receiptRepository.remove(receipt);
      
      this.logger.log(`Receipt deleted successfully: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete receipt: ${id}`, error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to delete receipt.');
    }
  }

  private isValidImageFile(file: Express.Multer.File): boolean {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    return allowedMimeTypes.includes(file.mimetype);
  }

  private isValidAiResponse(data: ExtractedReceiptData): boolean {
    return Boolean(
      data &&
      data.date &&
      data.currency &&
      data.vendor_name &&
      Array.isArray(data.receipt_items) &&
      data.receipt_items.length > 0 &&
      typeof data.tax === 'number' &&
      typeof data.total === 'number' &&
      data.tax >= 0 &&
      data.total >= 0
    );
  }

  private mapToResponseDto(receipt: Receipt): ReceiptResponseDto {
    return {
      id: receipt.id,
      date: receipt.date,
      currency: receipt.currency,
      vendor_name: receipt.vendor_name,
      receipt_items: receipt.getReceiptItems(),
      tax: receipt.tax,
      total: receipt.total,
      image_url: receipt.image_url,
    };
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      // Check database connection
      await this.receiptRepository.query('SELECT 1');
      
      // Check AI service
      const aiHealthy = await this.aiService.isHealthy();
      
      return Boolean(aiHealthy);
    } catch (error) {
      this.logger.error('Receipt service health check failed', error);
      return false;
    }
  }
}
