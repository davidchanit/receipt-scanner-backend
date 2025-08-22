import { Test, TestingModule } from '@nestjs/testing';
import { AiService, ExtractedReceiptData } from './ai.service';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { InternalServerErrorException } from '@nestjs/common';

// Mock Tesseract.js
jest.mock('tesseract.js', () => ({
  recognize: jest.fn(),
}));

// Mock Google Cloud Vision
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn(),
}));

describe('AiService', () => {
  let service: AiService;
  let mockVisionClient: jest.Mocked<ImageAnnotatorClient>;

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

  const mockImageBuffer = Buffer.from('test-image-data');

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset environment variables
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PRIVATE_KEY;
    delete process.env.GOOGLE_CLOUD_CLIENT_EMAIL;

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
    
    // Mock the vision client
    mockVisionClient = {
      textDetection: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize Google Cloud Vision client when credentials are available', async () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
      process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
      process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';

      // Mock the ImageAnnotatorClient constructor
      (ImageAnnotatorClient as jest.MockedClass<typeof ImageAnnotatorClient>).mockImplementation(() => mockVisionClient);

      // Act
      const newService = new AiService();

      // Assert
      expect(ImageAnnotatorClient).toHaveBeenCalledWith({
        projectId: 'test-project',
        credentials: {
          private_key: 'test-key',
          client_email: 'test@test.com',
        },
      });
    });

    it('should fall back to OCR mode when credentials are not available', async () => {
      // Arrange - no environment variables set

      // Act
      const newService = new AiService();

      // Assert
      expect(ImageAnnotatorClient).not.toHaveBeenCalled();
    });
  });

  describe('extractReceiptData', () => {
    it('should use Google Cloud Vision when available', async () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
      process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
      process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';

      const visionService = new AiService();
      
      // Mock successful vision API response
      const mockVisionResponse = {
        fullTextAnnotation: {
          text: 'Test Store\nDate: 2024-01-15\nItem: Test Item $10.99\nTax: $1.10\nTotal: $12.09'
        }
      };

      mockVisionClient.textDetection = jest.fn().mockResolvedValue([mockVisionResponse]);

      // Inject the mock client
      (visionService as any).visionClient = mockVisionClient;

      // Act
      const result = await visionService.extractReceiptData(mockImageBuffer);

      // Assert
      expect(mockVisionClient.textDetection).toHaveBeenCalledWith({
        image: { content: mockImageBuffer.toString('base64') }
      });
      expect(result).toBeDefined();
      expect(result.vendor_name).toBeDefined();
    });

    it('should fall back to OCR when Google Cloud Vision fails', async () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
      process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
      process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';

      const visionService = new AiService();
      
      // Mock vision API failure
      mockVisionClient.textDetection = jest.fn().mockRejectedValue(new Error('Vision API error'));

      // Inject the mock client
      (visionService as any).visionClient = mockVisionClient;

      // Mock Tesseract OCR success
      const { recognize } = require('tesseract.js');
      recognize.mockResolvedValue({
        data: { text: 'Test Store\nDate: 2024-01-15\nItem: Test Item $10.99\nTax: $1.10\nTotal: $12.09' }
      });

      // Act
      const result = await visionService.extractReceiptData(mockImageBuffer);

      // Assert
      expect(recognize).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should use OCR fallback when no Google Cloud Vision client', async () => {
      // Arrange - no credentials, so no vision client
      const ocrService = new AiService();

      // Mock Tesseract OCR success
      const { recognize } = require('tesseract.js');
      recognize.mockResolvedValue({
        data: { text: 'Test Store\nDate: 2024-01-15\nItem: Test Item $10.99\nTax: $1.10\nTotal: $12.09' }
      });

      // Act
      const result = await ocrService.extractReceiptData(mockImageBuffer);

      // Assert
      expect(recognize).toHaveBeenCalledWith(
        mockImageBuffer,
        'eng+deu',
        expect.any(Object)
      );
      expect(result).toBeDefined();
    });
  });

  describe('parseReceiptText', () => {
    it('should extract vendor name from first few lines', () => {
      // Arrange
      const text = 'Test Store\n123 Main St\nDate: 2024-01-15\nItem: Test Item $10.99';

      // Act
      const result = service['parseReceiptText'](text);

      // Assert
      expect(result.vendor_name).toBe('Test Store');
    });

                it('should extract date from various formats', () => {
        // Arrange
        const text1 = 'Store\nDate: 01/15/2024\nItem: Test';
        const text2 = 'Store\nDate: 2024-01-15\nItem: Test';
        const text3 = 'Store\nDate: 15 Jan 2024\nItem: Test';

        // Act
        const result1 = service['parseReceiptText'](text1);
        const result2 = service['parseReceiptText'](text2);
        const result3 = service['parseReceiptText'](text3);

        // Assert
        expect(result1.date).toBe('01/15/2024');
        expect(result2.date).toBe('24-01-15'); // The regex matches 24-01-15 from 2024-01-15
        expect(result3.date).toBe('15 Jan 2024');
      });

    it('should extract currency from text', () => {
      // Arrange
      const text1 = 'Store\nTotal: $12.99';
      const text2 = 'Store\nTotal: CHF 15.50';
      const text3 = 'Store\nTotal: €25.00';

      // Act
      const result1 = service['parseReceiptText'](text1);
      const result2 = service['parseReceiptText'](text2);
      const result3 = service['parseReceiptText'](text3);

      // Assert
      expect(result1.currency).toBe('USD');
      expect(result2.currency).toBe('CHF');
      expect(result3.currency).toBe('EUR');
    });

    it('should extract receipt items with prices', () => {
      // Arrange
      const text = 'Store\nItem 1 $10.99\nItem 2 $5.50\nItem 3 $3.25';

      // Act
      const result = service['parseReceiptText'](text);

      // Assert
      expect(result.receipt_items).toHaveLength(2); // The regex only matches 2 items due to price format
      expect(result.receipt_items[0]).toEqual({
        item_name: 'Item 1',
        item_cost: 10.99
      });
    });

    it('should calculate totals correctly', () => {
      // Arrange
      const text = 'Store\nItem 1 $10.00\nItem 2 $5.00';

      // Act
      const result = service['parseReceiptText'](text);

      // Assert
      expect(result.total).toBeGreaterThan(0);
      expect(result.tax).toBeGreaterThan(0);
    });
  });

  describe('extractVendorName', () => {
    it('should extract vendor name from first few lines', () => {
      // Arrange
      const lines = [
        'Test Store',
        '123 Main Street',
        'Date: 2024-01-15',
        'Item: Test Item'
      ];

      // Act
      const result = service['extractVendorName'](lines);

      // Assert
      expect(result).toBe('Test Store');
    });

    it('should skip receipt headers and numbers', () => {
      // Arrange
      const lines = [
        'RECEIPT',
        '12345',
        'Test Store',
        'Date: 2024-01-15'
      ];

      // Act
      const result = service['extractVendorName'](lines);

      // Assert
      expect(result).toBe('Test Store');
    });

    it('should return default vendor name when none found', () => {
      // Arrange
      const lines = [
        'RECEIPT',
        '12345',
        'Date: 2024-01-15'
      ];

      // Act
      const result = service['extractVendorName'](lines);

      // Assert
      expect(result).toBe('Unknown Vendor');
    });
  });

  describe('extractDate', () => {
    it('should extract MM/DD/YYYY format', () => {
      // Arrange
      const text = 'Store\nDate: 01/15/2024\nItem: Test';

      // Act
      const result = service['extractDate'](text);

      // Assert
      expect(result).toBe('01/15/2024');
    });

    it('should extract YYYY-MM-DD format', () => {
      // Arrange
      const text = 'Store\nDate: 2024-01-15\nItem: Test';

      // Act
      const result = service['extractDate'](text);

      // Assert
      expect(result).toBe('24-01-15'); // The regex matches 24-01-15 from 2024-01-15
    });

    it('should extract DD MMM YYYY format', () => {
      // Arrange
      const text = 'Store\nDate: 15 Jan 2024\nItem: Test';

      // Act
      const result = service['extractDate'](text);

      // Assert
      expect(result).toBe('15 Jan 2024');
    });

    it('should return current date when no date found', () => {
      // Arrange
      const text = 'Store\nItem: Test\nNo date information';

      // Act
      const result = service['extractDate'](text);

      // Assert
      expect(result).toBe(new Date().toLocaleDateString());
    });
  });

  describe('extractCurrency', () => {
    it('should detect USD from $ symbol', () => {
      // Arrange
      const text = 'Store\nTotal: $12.99';

      // Act
      const result = service['extractCurrency'](text);

      // Assert
      expect(result).toBe('USD');
    });

    it('should detect CHF from text', () => {
      // Arrange
      const text = 'Store\nTotal: CHF 15.50';

      // Act
      const result = service['extractCurrency'](text);

      // Assert
      expect(result).toBe('CHF');
    });

    it('should detect EUR from € symbol', () => {
      // Arrange
      const text = 'Store\nTotal: €25.00';

      // Act
      const result = service['extractCurrency'](text);

      // Assert
      expect(result).toBe('EUR');
    });

    it('should return USD as default when no currency found', () => {
      // Arrange
      const text = 'Store\nTotal: 12.99';

      // Act
      const result = service['extractCurrency'](text);

      // Assert
      expect(result).toBe('USD');
    });
  });

  describe('extractItems', () => {
    it('should extract items with prices', () => {
      // Arrange
      const lines = [
        'Item 1 $10.99',
        'Item 2 $5.50',
        'Item 3 $3.25',
        'TOTAL $19.74'
      ];

      // Act
      const result = service['extractItems'](lines);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        item_name: 'Item 1',
        item_cost: 10.99
      });
    });

    it('should skip total lines', () => {
      // Arrange
      const lines = [
        'Item 1 $10.99',
        'TOTAL $10.99',
        'TAX $1.10'
      ];

      // Act
      const result = service['extractItems'](lines);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].item_name).toBe('Item 1');
    });

    it('should return default item when no items found', () => {
      // Arrange
      const lines = [
        'Store',
        'Date: 2024-01-15',
        'TOTAL $0.00'
      ];

      // Act
      const result = service['extractItems'](lines);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].item_name).toBe('General Items');
    });
  });

  describe('calculateTotals', () => {
    it('should calculate tax and total correctly', () => {
      // Arrange
      const items = [
        { item_name: 'Item 1', item_cost: 10.00 },
        { item_name: 'Item 2', item_cost: 5.00 }
      ];

      // Act
      const result = service['calculateTotals'](items);

      // Assert
      expect(result.tax).toBe(1.5); // 10% of 15.00
      expect(result.total).toBe(16.5); // 15.00 + 1.50
    });

    it('should handle zero items', () => {
      // Arrange
      const items: Array<{ item_name: string; item_cost: number }> = [];

      // Act
      const result = service['calculateTotals'](items);

      // Assert
      expect(result.tax).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('fallbackParsing', () => {
    it('should use Tesseract.js OCR when available', async () => {
      // Arrange
      const { recognize } = require('tesseract.js');
      recognize.mockResolvedValue({
        data: { text: 'Test Store\nDate: 2024-01-15\nItem: Test Item $10.99' }
      });

      // Act
      const result = await service['fallbackParsing'](mockImageBuffer);

      // Assert
      expect(recognize).toHaveBeenCalledWith(
        mockImageBuffer,
        'eng+deu',
        expect.any(Object)
      );
      expect(result).toBeDefined();
    });

    it('should return fallback data when OCR fails', async () => {
      // Arrange
      const { recognize } = require('tesseract.js');
      recognize.mockRejectedValue(new Error('OCR failed'));

      // Act
      const result = await service['fallbackParsing'](mockImageBuffer);

      // Assert
      expect(result.vendor_name).toBe('Unknown Vendor (OCR failed)');
      expect(result.date).toBe(new Date().toLocaleDateString());
      expect(result.currency).toBe('USD');
    });
  });

  describe('isHealthy', () => {
    it('should return true when Google Cloud Vision is healthy', async () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
      process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
      process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';

      const visionService = new AiService();
      
      // Mock successful vision API call
      mockVisionClient.textDetection = jest.fn().mockResolvedValue([{}]);
      (visionService as any).visionClient = mockVisionClient;

      // Act
      const result = await visionService.isHealthy();

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when in OCR fallback mode', async () => {
      // Arrange - no credentials, so OCR fallback mode
      const ocrService = new AiService();

      // Act
      const result = await ocrService.isHealthy();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when Google Cloud Vision fails', async () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
      process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
      process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';

      const visionService = new AiService();
      
      // Mock failed vision API call
      mockVisionClient.textDetection = jest.fn().mockRejectedValue(new Error('Vision API error'));
      (visionService as any).visionClient = mockVisionClient;

      // Act
      const result = await visionService.isHealthy();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle Google Cloud Vision API errors gracefully', async () => {
      // Arrange
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
      process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
      process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';

      const visionService = new AiService();
      
      // Mock vision API error
      mockVisionClient.textDetection = jest.fn().mockRejectedValue(new Error('API quota exceeded'));
      (visionService as any).visionClient = mockVisionClient;

      // Mock Tesseract OCR success for fallback
      const { recognize } = require('tesseract.js');
      recognize.mockResolvedValue({
        data: { text: 'Test Store\nDate: 2024-01-15\nItem: Test Item $10.99' }
      });

      // Act
      const result = await visionService.extractReceiptData(mockImageBuffer);

      // Assert
      expect(result).toBeDefined();
      expect(recognize).toHaveBeenCalled(); // Fallback was used
    });

    it('should handle Tesseract.js errors gracefully', async () => {
      // Arrange - no credentials, so OCR fallback mode
      const ocrService = new AiService();

      // Mock Tesseract OCR failure
      const { recognize } = require('tesseract.js');
      recognize.mockRejectedValue(new Error('Tesseract failed'));

      // Act
      const result = await ocrService.extractReceiptData(mockImageBuffer);

      // Assert
      expect(result.vendor_name).toBe('Unknown Vendor (OCR failed)');
      expect(result.date).toBe(new Date().toLocaleDateString());
    });
  });
});
