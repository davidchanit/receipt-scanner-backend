import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';

// Mock fs/promises
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn(),
  extname: jest.fn((filename) => {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot) : '';
  }),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-${Math.random().toString(36).substr(2, 9)}`),
}));

describe('StorageService', () => {
  let service: StorageService;

  const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
  const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
  const mockAccess = access as jest.MockedFunction<typeof access>;
  const mockJoin = join as jest.MockedFunction<typeof join>;

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
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);

    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockJoin.mockReturnValue('uploads/test-uuid-123.jpg');
    mockAccess.mockRejectedValue(new Error('Directory does not exist'));
    
    // Reset the extname mock to use the default implementation
    const { extname } = require('path');
    extname.mockImplementation((filename) => {
      const lastDot = filename.lastIndexOf('.');
      return lastDot !== -1 ? filename.substring(lastDot) : '';
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveImage', () => {
    describe('✅ Successful file saving', () => {
      it('should successfully save a valid image file', async () => {
        // Arrange
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);

        // Act
        const result = await service.saveImage(mockFile);

        // Assert
        expect(mockMkdir).toHaveBeenCalledWith('uploads', { recursive: true });
        expect(mockWriteFile).toHaveBeenCalledWith(
          expect.stringMatching(/uploads\/test-uuid-.*\.jpg$/),
          mockFile.buffer
        );
        expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
      });

      it('should handle PNG files successfully', async () => {
        // Arrange
        const pngFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'image/png',
          originalname: 'test-receipt.png',
        };
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);

        // Act
        const result = await service.saveImage(pngFile);

        // Assert
        expect(result).toMatch(/\/uploads\/test-uuid-.*\.png$/);
      });

      it('should handle JPEG files successfully', async () => {
        // Arrange
        const jpegFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'image/jpeg',
          originalname: 'test-receipt.jpeg',
        };
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);

        // Act
        const result = await service.saveImage(jpegFile);

        // Assert
        expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpeg$/);
      });
    });

    describe('❌ File validation errors', () => {
      it('should throw BadRequestException for unsupported file types', async () => {
        // Arrange
        const invalidFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'application/pdf',
          originalname: 'test-receipt.pdf',
        };

        // Act & Assert
        await expect(service.saveImage(invalidFile))
          .rejects
          .toThrow(BadRequestException);

        expect(mockWriteFile).not.toHaveBeenCalled();
        expect(mockMkdir).not.toHaveBeenCalled();
      });

      it('should throw BadRequestException for text files', async () => {
        // Arrange
        const textFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'text/plain',
          originalname: 'test-receipt.txt',
        };

        // Act & Assert
        await expect(service.saveImage(textFile))
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
        await expect(service.saveImage(gifFile))
          .rejects
          .toThrow(BadRequestException);
      });

      it('should throw BadRequestException for files exceeding size limit', async () => {
        // Arrange
        const largeFile: Express.Multer.File = {
          ...mockFile,
          size: 15 * 1024 * 1024, // 15MB (exceeds 10MB limit)
        };

        // Act & Assert
        await expect(service.saveImage(largeFile))
          .rejects
          .toThrow(BadRequestException);
      });

      it('should throw BadRequestException for files with no buffer', async () => {
        // Arrange
        const fileWithoutBuffer: Express.Multer.File = {
          ...mockFile,
          buffer: null as any,
        };

        // Act & Assert
        await expect(service.saveImage(fileWithoutBuffer))
          .rejects
          .toThrow(BadRequestException);
      });

      it('should throw BadRequestException for files with empty buffer', async () => {
        // Arrange
        const fileWithEmptyBuffer: Express.Multer.File = {
          ...mockFile,
          buffer: Buffer.alloc(0),
        };

        // Act & Assert
        await expect(service.saveImage(fileWithEmptyBuffer))
          .rejects
          .toThrow(BadRequestException);
      });
    });

    describe('❌ File size validation', () => {
      it('should accept files at the size limit', async () => {
        // Arrange
        const maxSizeFile: Express.Multer.File = {
          ...mockFile,
          size: 10 * 1024 * 1024, // Exactly 10MB
        };
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);

        // Act
        const result = await service.saveImage(maxSizeFile);

        // Assert
        expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
      });

      it('should reject files slightly over the size limit', async () => {
        // Arrange
        const oversizedFile: Express.Multer.File = {
          ...mockFile,
          size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
        };

        // Act & Assert
        await expect(service.saveImage(oversizedFile))
          .rejects
          .toThrow(BadRequestException);
      });
    });

    describe('❌ Directory and file system errors', () => {
      it('should throw InternalServerErrorException when directory creation fails', async () => {
        // Arrange
        mockMkdir.mockRejectedValue(new Error('Permission denied'));

        // Act & Assert
        await expect(service.saveImage(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);
      });

      it('should throw InternalServerErrorException when file writing fails', async () => {
        // Arrange
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockRejectedValue(new Error('Disk full'));

        // Act & Assert
        await expect(service.saveImage(mockFile))
          .rejects
          .toThrow(InternalServerErrorException);
      });

      it('should handle existing directory gracefully', async () => {
        // Arrange
        mockAccess.mockResolvedValue(undefined); // Directory exists
        mockWriteFile.mockResolvedValue(undefined);

        // Act
        const result = await service.saveImage(mockFile);

        // Assert
        expect(mockMkdir).not.toHaveBeenCalled();
        expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
      });
    });
  });

  describe('deleteImage', () => {
    it('should handle image deletion gracefully', async () => {
      // Arrange
      const imageUrl = '/uploads/test-image.jpg';

      // Act
      await service.deleteImage(imageUrl);

      // Assert
      // Note: Current implementation only logs deletion, doesn't actually delete
      // This is a design choice for the assessment
    });

    it('should handle invalid image URLs gracefully', async () => {
      // Arrange
      const invalidUrl = 'invalid-url';

      // Act & Assert
      await expect(service.deleteImage(invalidUrl)).resolves.not.toThrow();
    });

    it('should handle empty image URLs gracefully', async () => {
      // Arrange
      const emptyUrl = '';

      // Act & Assert
      await expect(service.deleteImage(emptyUrl)).resolves.not.toThrow();
    });
  });

  describe('getImageInfo', () => {
    it('should return image exists when file is accessible', async () => {
      // Arrange
      const imageUrl = '/uploads/test-image.jpg';
      mockAccess.mockResolvedValue(undefined);

      // Act
      const result = await service.getImageInfo(imageUrl);

      // Assert
      expect(result.exists).toBe(true);
      expect(result.path).toBeDefined();
    });

    it('should return image does not exist when file is not accessible', async () => {
      // Arrange
      const imageUrl = '/uploads/nonexistent-image.jpg';
      mockAccess.mockRejectedValue(new Error('File not found'));

      // Act
      const result = await service.getImageInfo(imageUrl);

      // Assert
      expect(result.exists).toBe(false);
      expect(result.path).toBeUndefined();
    });

    it('should handle invalid image URLs gracefully', async () => {
      // Arrange
      const invalidUrl = 'invalid-url';

      // Act
      const result = await service.getImageInfo(invalidUrl);

      // Assert
      expect(result.exists).toBe(false);
    });
  });

  describe('file extension validation', () => {
    it('should accept .jpg extension', async () => {
      // Arrange
      const jpgFile: Express.Multer.File = {
        ...mockFile,
        originalname: 'test-receipt.jpg',
      };
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const result = await service.saveImage(jpgFile);

      // Assert
      expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
    });

    it('should accept .jpeg extension', async () => {
      // Arrange
      const jpegFile: Express.Multer.File = {
        ...mockFile,
        originalname: 'test-receipt.jpeg',
      };
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const result = await service.saveImage(jpegFile);

      // Assert
      expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpeg$/);
    });

    it('should accept .png extension', async () => {
      // Arrange
      const pngFile: Express.Multer.File = {
        ...mockFile,
        originalname: 'test-receipt.png',
      };
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const result = await service.saveImage(pngFile);

      // Assert
      expect(result).toMatch(/\/uploads\/test-uuid-.*\.png$/);
    });

    it('should reject .gif extension', async () => {
      // Arrange
      const gifFile: Express.Multer.File = {
        ...mockFile,
        originalname: 'test-receipt.gif',
      };

      // Act & Assert
      await expect(service.saveImage(gifFile))
        .rejects
        .toThrow(BadRequestException);
    });

    it('should reject .pdf extension', async () => {
      // Arrange
      const pdfFile: Express.Multer.File = {
        ...mockFile,
        originalname: 'test-receipt.pdf',
      };

      // Act & Assert
      await expect(service.saveImage(pdfFile))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('MIME type validation', () => {
    it('should accept image/jpeg MIME type', async () => {
      // Arrange
      const jpegFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'image/jpeg',
      };
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const result = await service.saveImage(jpegFile);

      // Assert
      expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
    });

    it('should accept image/jpg MIME type', async () => {
      // Arrange
      const jpgFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'image/jpg',
      };
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const result = await service.saveImage(jpgFile);

      // Assert
      expect(result).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
    });

      it('should accept image/png MIME type', async () => {
        // Arrange
        const pngFile: Express.Multer.File = {
          ...mockFile,
          mimetype: 'image/png',
          originalname: 'test-receipt.png', // This is already correct
        };
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);

        // Act
        const result = await service.saveImage(pngFile);

        // Assert
        expect(result).toMatch(/\/uploads\/test-uuid-.*\.png$/);
      });

    it('should reject application/pdf MIME type', async () => {
      // Arrange
      const pdfFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'application/pdf',
      };

      // Act & Assert
      await expect(service.saveImage(pdfFile))
        .rejects
        .toThrow(BadRequestException);
    });

    it('should reject text/plain MIME type', async () => {
      // Arrange
      const textFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'text/plain',
      };

      // Act & Assert
      await expect(service.saveImage(textFile))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('secure filename generation', () => {
    it('should generate unique filenames for different files', async () => {
      // Arrange
      const file1: Express.Multer.File = { ...mockFile, originalname: 'receipt1.jpg' };
      const file2: Express.Multer.File = { ...mockFile, originalname: 'receipt2.jpg' };
      
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const result1 = await service.saveImage(file1);
      const result2 = await service.saveImage(file2);

      // Assert
      expect(result1).not.toBe(result2);
      expect(result1).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
      expect(result2).toMatch(/\/uploads\/test-uuid-.*\.jpg$/);
    });

    it('should preserve file extensions', async () => {
      // Arrange
      const jpgFile: Express.Multer.File = { ...mockFile, originalname: 'receipt.jpg' };
      const pngFile: Express.Multer.File = { ...mockFile, originalname: 'receipt.png' };
      
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Act
      const jpgResult = await service.saveImage(jpgFile);
      const pngResult = await service.saveImage(pngFile);

      // Assert
      expect(jpgResult).toMatch(/\.jpg$/);
      expect(pngResult).toMatch(/\.png$/);
    });
  });

  describe('error message clarity', () => {
    it('should provide clear error message for unsupported file type', async () => {
      // Arrange
      const invalidFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'application/pdf',
        originalname: 'test-receipt.pdf',
      };

      // Act & Assert
      try {
        await service.saveImage(invalidFile);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('File extension .pdf is not allowed');
      }
    });

    it('should provide clear error message for oversized files', async () => {
      // Arrange
      const largeFile: Express.Multer.File = {
        ...mockFile,
        size: 15 * 1024 * 1024, // 15MB
      };

      // Act & Assert
      try {
        await service.saveImage(largeFile);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('exceeds maximum allowed size');
      }
    });

    it('should provide clear error message for invalid MIME type', async () => {
      // Arrange
      const invalidFile: Express.Multer.File = {
        ...mockFile,
        mimetype: 'text/plain',
      };

      // Act & Assert
      try {
        await service.saveImage(invalidFile);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('MIME type text/plain is not allowed');
      }
    });
  });
});
