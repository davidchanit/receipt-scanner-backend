import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Param, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  ParseUUIDPipe,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReceiptService } from './receipt.service';
import { ReceiptResponseDto } from './dto/receipt.dto';

@Controller('receipt')
export class ReceiptController {
  private readonly logger = new Logger(ReceiptController.name);

  constructor(private readonly receiptService: ReceiptService) {}

  @Post('extract-receipt-details')
  @UseInterceptors(FileInterceptor('image'))
  @HttpCode(HttpStatus.OK)
  async extractReceiptDetails(@UploadedFile() file: Express.Multer.File): Promise<ReceiptResponseDto> {
    this.logger.log(`Receipt extraction request received for file: ${file?.originalname || 'unknown'}`);
    
    if (!file) {
      throw new BadRequestException('No image file provided. Please upload an image file.');
    }

    this.logger.log(`Processing file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    
    try {
      const result = await this.receiptService.extractReceiptDetails(file);
      this.logger.log(`Receipt extraction successful: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Receipt extraction failed: ${error.message}`);
      throw error;
    }
  }

  @Get(':id')
  async getReceiptById(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptResponseDto> {
    this.logger.log(`Get receipt request received for ID: ${id}`);
    return this.receiptService.getReceiptById(id);
  }

  @Get()
  async getAllReceipts(): Promise<ReceiptResponseDto[]> {
    this.logger.log('Get all receipts request received');
    return this.receiptService.getAllReceipts();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReceipt(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    this.logger.log(`Delete receipt request received for ID: ${id}`);
    await this.receiptService.deleteReceipt(id);
  }

  // Health check endpoint
  @Get('health/check')
  async healthCheck(): Promise<{ status: string; timestamp: string; service: string }> {
    const isHealthy = await this.receiptService.isHealthy();
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'receipt-service',
    };
  }
}
