import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReceiptService } from './receipt.service';
import { Receipt } from './entities/receipt.entity';
import { AiService, ExtractedReceiptData } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

describe('ReceiptService', () => {
  let service: ReceiptService;
  let receiptRepository: Repository<Receipt>;
  let aiService: AiService;
  let storageService: StorageService;

  const mockReceiptRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
  };

  const mockAiService = {
    extractReceiptData: jest.fn(),
    isHealthy: jest.fn(),
  };

  const mockStorageService = {
    saveImage: jest.fn(),
    deleteImage: jest.fn(),
  };

  const mockReceipt = {
    id: 'test-uuid',
    date: '2024-01-15',
    currency: 'USD',
    vendor_name: 'Test Store',
    receipt_items: JSON.stringify([
      { item_name: 'Test Item', item_cost: 10.99 }
    ]),
    tax: 1.10,
    total: 12.09,
    image_url: '/uploads/test-image.jpg',
    created_at: new Date(),
    updated_at: new Date(),
    getReceiptItems: jest.fn().mockReturnValue([
      { item_name: 'Test Item', item_cost: 10.99 }
    ]),
  };

  const mockExtractedData: ExtractedReceiptData = {
    date: '2024-01-15',
    currency: 'USD',
    vendor_name: 'Test Store',
    receipt_items: [
      { item_name: 'Test Item', item_cost: 10.99 }
    ],
    tax: 1.10,
    total: 12.09,
  };

  const mockFile: Express.Multer.File = {
    fieldname: 'image',
    originalname: 'test-receipt.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('test-image-data'),
    size: 1024,
    stream: null,
    destination: null,
    filename: null,
    path: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptService,
        {
          provide: getRepositoryToken(Receipt),
          useValue: mockReceiptRepository,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    service = module.get<ReceiptService>(ReceiptService);
    receiptRepository = module.get<Repository<Receipt>>(getRepositoryToken(Receipt));
    aiService = module.get<AiService>(AiService);
    storageService = module.get<StorageService>(StorageService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractReceiptDetails', () => {
    describe('✅ Successful extraction from valid image', () => {
      it('should successfully extract receipt details from a valid image', async () => {
        // Arrange
        const validFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'image/jpeg',
          size: 1024,
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(mockExtractedData);
        mockReceiptRepository.create.mockReturnValue(mockReceipt);
        mockReceiptRepository.save.mockResolvedValue(mockReceipt);

        // Act
        const result = await service.extractReceiptDetails(validFile);

        // Assert
        expect(mockStorageService.saveImage).toHaveBeenCalledWith(validFile);
        expect(mockAiService.extractReceiptData).toHaveBeenCalledWith(validFile.buffer);
        expect(mockReceiptRepository.create).toHaveBeenCalledWith({
          date: mockExtractedData.date,
          currency: mockExtractedData.currency,
          vendor_name: mockExtractedData.vendor_name,
          receipt_items: JSON.stringify(mockExtractedData.receipt_items),
          tax: mockExtractedData.tax,
          total: mockExtractedData.total,
          image_url: '/uploads/test-image.jpg',
        });
        expect(mockReceiptRepository.save).toHaveBeenCalledWith(mockReceipt);
        expect(result).toEqual({
          id: mockReceipt.id,
          date: mockReceipt.date,
          currency: mockReceipt.currency,
          vendor_name: mockReceipt.vendor_name,
          receipt_items: mockReceipt.getReceiptItems(),
          tax: mockReceipt.tax,
          total: mockReceipt.total,
          image_url: mockReceipt.image_url,
        });
      });

      it('should handle PNG files successfully', async () => {
        // Arrange
        const pngFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'image/png',
          originalname: 'test-receipt.png',
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.png');
        mockAiService.extractReceiptData.mockResolvedValue(mockExtractedData);
        mockReceiptRepository.create.mockReturnValue(mockReceipt);
        mockReceiptRepository.save.mockResolvedValue(mockReceipt);

        // Act
        const result = await service.extractReceiptDetails(pngFile);

        // Assert
        expect(result).toBeDefined();
        expect(mockStorageService.saveImage).toHaveBeenCalledWith(pngFile);
      });
    });

    describe('❌ Incorrect file type', () => {
      it('should throw BadRequestException for unsupported file types', async () => {
        // Arrange
        const invalidFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'application/pdf',
          originalname: 'test-receipt.pdf',
        };

        // Act & Assert
        await expect(service.extractReceiptDetails(invalidFile))
          .rejects
          .toThrow(BadRequestException);

        expect(mockStorageService.saveImage).not.toHaveBeenCalled();
        expect(mockAiService.extractReceiptData).not.toHaveBeenCalled();
        expect(mockReceiptRepository.create).not.toHaveBeenCalled();
      });

      it('should throw BadRequestException for text files', async () => {
        // Arrange
        const textFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'text/plain',
          originalname: 'test-receipt.txt',
        };

        // Act & Assert
        await expect(service.extractReceiptDetails(textFile))
          .rejects
          .toThrow(BadRequestException);
      });

      it('should throw BadRequestException for GIF files', async () => {
        // Arrange
        const gifFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'image/gif',
          originalname: 'test-receipt.gif',
        };

        // Act & Assert
        await expect(service.extractReceiptDetails(gifFile))
          .rejects
          .toThrow(BadRequestException);
      });
    });

    describe('❌ Invalid response from AI model', () => {
      it('should throw InternalServerErrorException for empty AI response', async () => {
        // Arrange
        const emptyAiResponse: ExtractedReceiptData = {
          date: '',
          currency: '',
          vendor_name: '',
          receipt_items: [],
          tax: 0,
          total: 0,
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(emptyAiResponse);

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        // Verify cleanup was attempted
        expect(mockStorageService.deleteImage).toHaveBeenCalledWith('/uploads/test-image.jpg');
      });

      it('should throw InternalServerErrorException for missing vendor name', async () => {
        // Arrange
        const invalidAiResponse: ExtractedReceiptData = {
          date: '2024-01-15',
          currency: 'USD',
          vendor_name: '', // Missing vendor name
          receipt_items: [{ item_name: 'Test Item', item_cost: 10.99 }],
          tax: 1.10,
          total: 12.09,
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(invalidAiResponse);

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        expect(mockStorageService.deleteImage).toHaveBeenCalledWith('/uploads/test-image.jpg');
      });

      it('should throw InternalServerErrorException for missing receipt items', async () => {
        // Arrange
        const invalidAiResponse: ExtractedReceiptData = {
          date: '2024-01-15',
          currency: 'USD',
          vendor_name: 'Test Store',
          receipt_items: [], // Empty items array
          tax: 1.10,
          total: 12.09,
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(invalidAiResponse);

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        expect(mockStorageService.deleteImage).toHaveBeenCalledWith('/uploads/test-image.jpg');
      });

      it('should throw InternalServerErrorException for negative tax amount', async () => {
        // Arrange
        const invalidAiResponse: ExtractedReceiptData = {
          date: '2024-01-15',
          currency: 'USD',
          vendor_name: 'Test Store',
          receipt_items: [{ item_name: 'Test Item', item_cost: 10.99 }],
          tax: -1.10, // Negative tax
          total: 12.09,
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(invalidAiResponse);

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        expect(mockStorageService.deleteImage).toHaveBeenCalledWith('/uploads/test-image.jpg');
      });

      it('should throw InternalServerErrorException for null AI response', async () => {
        // Arrange
        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(null as any);

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        // No cleanup happens when AI service returns null - the error is caught and rethrown
        // The service will throw an error before reaching the validation step
        expect(mockStorageService.deleteImage).not.toHaveBeenCalled();
      });
    });

    describe('❌ 500 status response scenarios', () => {
      it('should throw InternalServerErrorException when AI service fails', async () => {
        // Arrange
        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockRejectedValue(
          new Error('AI service unavailable')
        );

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        // No cleanup happens when AI service fails - the error is caught and rethrown
        expect(mockStorageService.deleteImage).not.toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException when storage service fails', async () => {
        // Arrange
        mockStorageService.saveImage.mockRejectedValue(
          new Error('Storage service unavailable')
        );

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        expect(mockAiService.extractReceiptData).not.toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException when database save fails', async () => {
        // Arrange
        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(mockExtractedData);
        mockReceiptRepository.create.mockReturnValue(mockReceipt);
        mockReceiptRepository.save.mockRejectedValue(
          new Error('Database connection failed')
        );

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        // No cleanup happens when database save fails - the error is caught and rethrown
        expect(mockStorageService.deleteImage).not.toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException when image cleanup fails', async () => {
        // Arrange
        const invalidAiResponse: ExtractedReceiptData = {
          date: '2024-01-15',
          currency: 'USD',
          vendor_name: 'Test Store',
          receipt_items: [{ item_name: 'Test Item', item_cost: 10.99 }],
          tax: -1.10, // Invalid tax to trigger cleanup
          total: 12.09,
        };

        mockStorageService.saveImage.mockResolvedValue('/uploads/test-image.jpg');
        mockAiService.extractReceiptData.mockResolvedValue(invalidAiResponse);
        mockStorageService.deleteImage.mockRejectedValue(
          new Error('Cleanup failed')
        );

        // Act & Assert
        await expect(service.extractReceiptDetails(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);

        // Cleanup should still be attempted even if it fails
        expect(mockStorageService.deleteImage).toHaveBeenCalledWith('/uploads/test-image.jpg');
      });
    });

    describe('Edge cases and validation', () => {
      it('should handle files with no buffer', async () => {
        // Arrange
        const fileWithoutBuffer: Express.Multer.File = {
          ...mockFile,
          buffer: null as any,
        };

        // Act & Assert
        await expect(service.extractReceiptDetails(fileWithoutBuffer))
          .rejects
          .toThrow(InternalServerErrorException);
      });

      it('should handle files with empty buffer', async () => {
        // Arrange
        const fileWithEmptyBuffer: Express.Multer.File = {
          ...mockFile,
          buffer: Buffer.alloc(0),
        };

        // Act & Assert
        await expect(service.extractReceiptDetails(fileWithEmptyBuffer))
          .rejects
          .toThrow(InternalServerErrorException);
      });

      it('should validate file size limits', async () => {
        // Arrange
        const largeFile: Express.Multer.File = {
          ...mockFile,
          size: 15 * 1024 * 1024, // 15MB (exceeds 10MB limit)
        };

        // Act & Assert
        await expect(service.extractReceiptDetails(largeFile))
          .rejects
          .toThrow(InternalServerErrorException);
      });
    });
  });

  describe('getReceiptById', () => {
    it('should return receipt when found', async () => {
      // Arrange
      mockReceiptRepository.findOne.mockResolvedValue(mockReceipt);

      // Act
      const result = await service.getReceiptById('test-uuid');

      // Assert
      expect(result).toBeDefined();
      expect(mockReceiptRepository.findOne).toHaveBeenCalledWith({ where: { id: 'test-uuid' } });
    });

    it('should throw BadRequestException when receipt not found', async () => {
      // Arrange
      mockReceiptRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getReceiptById('non-existent'))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('getAllReceipts', () => {
    it('should return all receipts ordered by creation date', async () => {
      // Arrange
      const mockReceipts = [mockReceipt];
      mockReceiptRepository.find.mockResolvedValue(mockReceipts);

      // Act
      const result = await service.getAllReceipts();

      // Assert
      expect(result).toEqual([{
        id: mockReceipt.id,
        date: mockReceipt.date,
        currency: mockReceipt.currency,
        vendor_name: mockReceipt.vendor_name,
        receipt_items: mockReceipt.getReceiptItems(),
        tax: mockReceipt.tax,
        total: mockReceipt.total,
        image_url: mockReceipt.image_url,
      }]);
      expect(mockReceiptRepository.find).toHaveBeenCalledWith({
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('deleteReceipt', () => {
    it('should delete receipt and associated image', async () => {
      // Arrange
      mockReceiptRepository.findOne.mockResolvedValue(mockReceipt);
      mockReceiptRepository.remove.mockResolvedValue(mockReceipt as any);
      mockStorageService.deleteImage.mockResolvedValue(undefined);

      // Act
      await service.deleteReceipt('test-uuid');

      // Assert
      expect(mockStorageService.deleteImage).toHaveBeenCalledWith(mockReceipt.image_url);
      expect(mockReceiptRepository.remove).toHaveBeenCalledWith(mockReceipt);
    });

    it('should throw BadRequestException when receipt not found', async () => {
      // Arrange
      mockReceiptRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteReceipt('non-existent'))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('isHealthy', () => {
    it('should return true when all services are healthy', async () => {
      // Arrange
      mockReceiptRepository.query.mockResolvedValue([{ '1': 1 }]);
      mockAiService.isHealthy.mockResolvedValue(true);

      // Act
      const result = await service.isHealthy();

      // Assert
      expect(result).toBe(true);
      expect(mockReceiptRepository.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockAiService.isHealthy).toHaveBeenCalled();
    });

    it('should return false when database is unhealthy', async () => {
      // Arrange
      mockReceiptRepository.query.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.isHealthy();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when AI service is unhealthy', async () => {
      // Arrange
      mockReceiptRepository.query.mockResolvedValue([{ '1': 1 }]);
      mockAiService.isHealthy.mockResolvedValue(false);

      // Act
      const result = await service.isHealthy();

      // Assert
      expect(result).toBe(false);
    });
  });
});
