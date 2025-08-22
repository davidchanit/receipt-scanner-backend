import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { writeFile, mkdir, access } from 'fs/promises';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir = 'uploads';
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedExtensions = ['.jpg', '.jpeg', '.png'];
  private readonly allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];

  async saveImage(file: Express.Multer.File): Promise<string> {
    try {
      this.logger.log(`Processing file upload: ${file.originalname} (${file.size} bytes)`);
      
      // Validate file
      await this.validateFile(file);
      
      // Ensure upload directory exists
      await this.ensureUploadDirectory();
      
      // Generate secure filename
      const filename = this.generateSecureFilename(file.originalname);
      const filepath = join(this.uploadDir, filename);
      
      // Save file
      await writeFile(filepath, file.buffer);
      
      this.logger.log(`Image saved successfully: ${filename}`);
      
      // Return relative URL
      return `/uploads/${filename}`;
    } catch (error) {
      this.logger.error('Failed to save image file', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to save image file');
    }
  }

  private async validateFile(file: Express.Multer.File): Promise<void> {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size ${file.size} bytes exceeds maximum allowed size of ${this.maxFileSize} bytes`
      );
    }

    // Check file extension
    const extension = extname(file.originalname).toLowerCase();
    if (!this.allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        `File extension ${extension} is not allowed. Allowed: ${this.allowedExtensions.join(', ')}`
      );
    }

    // Check MIME type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `MIME type ${file.mimetype} is not allowed. Allowed: ${this.allowedMimeTypes.join(', ')}`
      );
    }

    // Additional security checks
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File buffer is empty or invalid');
    }
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await access(this.uploadDir);
    } catch {
      await mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  private generateSecureFilename(originalname: string): string {
    const extension = extname(originalname).toLowerCase();
    const uuid = uuidv4();
    return `${uuid}${extension}`;
  }

  async deleteImage(imageUrl: string): Promise<void> {
    try {
      const filename = imageUrl.split('/').pop();
      if (filename) {
        const filepath = join(this.uploadDir, filename);
        await access(filepath); // Check if file exists
        // Note: In production, you might want to implement actual deletion
        this.logger.log(`Image marked for deletion: ${filename}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete image: ${imageUrl}`, error);
    }
  }

  async getImageInfo(imageUrl: string): Promise<{ exists: boolean; size?: number; path?: string }> {
    try {
      const filename = imageUrl.split('/').pop();
      if (filename) {
        const filepath = join(this.uploadDir, filename);
        await access(filepath);
        return { exists: true, path: filepath };
      }
      return { exists: false };
    } catch (error) {
      return { exists: false };
    }
  }
}
