import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import Tesseract from 'tesseract.js';

export interface ExtractedReceiptData {
  date: string;
  currency: string;
  vendor_name: string;
  receipt_items: Array<{
    item_name: string;
    item_cost: number;
  }>;
  tax: number;
  total: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private visionClient: ImageAnnotatorClient | null = null;

  constructor() {
    this.initializeVisionClient();
  }

  private async initializeVisionClient(): Promise<void> {
    try {
      // Check if Google Cloud credentials are available
      if (process.env.GOOGLE_CLOUD_PROJECT_ID && 
          process.env.GOOGLE_CLOUD_PRIVATE_KEY && 
          process.env.GOOGLE_CLOUD_CLIENT_EMAIL) {
        
        // Initialize with explicit credentials
        this.visionClient = new ImageAnnotatorClient({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
          credentials: {
            private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY,
            client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
          },
        });
        
        this.logger.log('Google Cloud Vision client initialized successfully with secure credentials');
      } else {
        this.logger.warn('Google Cloud Vision credentials not found, using Tesseract.js OCR fallback');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Google Cloud Vision client', error);
      this.logger.warn('Falling back to Tesseract.js OCR mode');
    }
  }

  async extractReceiptData(imageBuffer: Buffer): Promise<ExtractedReceiptData> {
    try {
      this.logger.log('Starting receipt data extraction');
      
      if (this.visionClient) {
        this.logger.log('Using Google Cloud Vision API for extraction');
        return await this.extractWithVisionApi(imageBuffer);
      } else {
        this.logger.log('Using Tesseract.js OCR fallback parsing');
        return await this.fallbackParsing(imageBuffer);
      }
    } catch (error) {
      this.logger.error('AI service failed, falling back to Tesseract.js OCR', error);
      return await this.fallbackParsing(imageBuffer);
    }
  }

  private async extractWithVisionApi(imageBuffer: Buffer): Promise<ExtractedReceiptData> {
    try {
      // Convert image to base64
      const imageBase64 = imageBuffer.toString('base64');

      // Perform OCR using Google Cloud Vision
      const [result] = await this.visionClient!.textDetection({
        image: { content: imageBase64 },
      });

      const text = result.fullTextAnnotation?.text || '';
      this.logger.debug(`OCR extracted text: ${text.substring(0, 200)}...`);
      
      return this.parseReceiptText(text);
    } catch (error) {
      this.logger.error('Google Cloud Vision API failed', error);
      throw new InternalServerErrorException('AI service temporarily unavailable');
    }
  }

  private parseReceiptText(text: string): ExtractedReceiptData {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Extract vendor name (usually first few lines)
    const vendorName = this.extractVendorName(lines);
    
    // Extract date
    const date = this.extractDate(text);
    
    // Extract currency
    const currency = this.extractCurrency(text);
    
    // Extract items and costs
    const items = this.extractItems(lines);
    
    // Calculate totals
    const { tax, total } = this.calculateTotals(items);
    
    this.logger.log(`Parsed receipt: ${vendorName} - ${date} - ${currency} - Total: ${total}`);
    
    return {
      date,
      currency,
      vendor_name: vendorName,
      receipt_items: items,
      tax,
      total,
    };
  }

  private extractVendorName(lines: string[]): string {
    // Look for vendor name in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip empty lines, numbers, and common receipt headers
      if (line && line.length > 3 && 
          !line.match(/^\d/) && 
          !line.match(/^[A-Z\s]+$/) &&
          !line.match(/^(Rech|Receipt|Invoice|Bill|Date|Time|Table|Tisch)/i)) {
        
        // Clean up the vendor name
        let vendorName = line.replace(/\s+/g, ' ').trim();
        
        // Remove common suffixes
        vendorName = vendorName.replace(/\s+(GmbH|AG|Ltd|Inc|Corp|LLC|Restaurant|Hotel|Cafe|Bar)$/i, '');
        
        return vendorName;
      }
    }
    return 'Unknown Vendor';
  }

  private extractDate(text: string): string {
    // Look for various date formats
    const datePatterns = [
      /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,  // MM/DD/YYYY
      /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,    // YYYY/MM/DD
      /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}/gi, // DD MMM YYYY
      /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}/gi, // DD Month YYYY
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return new Date().toLocaleDateString();
  }

  private extractCurrency(text: string): string {
    // Look for currency symbols or codes
    const currencyPatterns = {
      'CHF': /\bCHF\b|\bSwiss\b|\bSchweiz\b/,  // Swiss Francs
      'USD': /\$|\bUSD\b|\bUS\$\b/,
      'EUR': /€|\bEUR\b/,
      'GBP': /£|\bGBP\b/,
      'CAD': /\bCAD\b/,
      'AUD': /\bAUD\b/,
    };

    for (const [code, pattern] of Object.entries(currencyPatterns)) {
      if (pattern.test(text)) {
        return code;
      }
    }

    return 'USD'; // Default
  }

  private extractItems(lines: string[]): Array<{ item_name: string; item_cost: number }> {
    const items: Array<{ item_name: string; item_cost: number }> = [];
    
    // Look for lines with prices in various formats
    lines.forEach((line, index) => {
      // Match various price formats: $12.99, 12.99, CHF 12.99, etc.
      const priceMatch = line.match(/(?:CHF|USD|EUR|£|\$)?\s*(\d+[.,]\d{2})/);
      if (priceMatch && index < lines.length - 1) {
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        const itemName = line.replace(priceMatch[0], '').trim();
        
        if (itemName && itemName.length > 2 && 
            !itemName.match(/^(TOTAL|TAX|SUBTOTAL|BALANCE|MwSt|VAT)/i)) {
          items.push({
            item_name: itemName,
            item_cost: price,
          });
        }
      }
    });

    return items.length > 0 ? items : [{ item_name: 'General Items', item_cost: 0 }];
  }

  private calculateTotals(items: Array<{ item_name: string; item_cost: number }>): { tax: number; total: number } {
    const subtotal = items.reduce((sum, item) => sum + item.item_cost, 0);
    
    // Try to find actual total in the text (this would be passed from parseReceiptText)
    // For now, use calculated values
    const tax = subtotal * 0.1; // Assume 10% tax
    const total = subtotal + tax;

    return {
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  private async fallbackParsing(imageBuffer: Buffer): Promise<ExtractedReceiptData> {
    // Enhanced fallback parsing using Tesseract.js OCR
    this.logger.log('Using Tesseract.js OCR fallback parsing method');
    
    try {
      // Use Tesseract.js for OCR text extraction
      const result = await Tesseract.recognize(
        imageBuffer,
        'eng+deu', // English + German (for Swiss receipts)
        {
          logger: m => this.logger.debug(`Tesseract: ${m.status}`),
        }
      );
      
      const extractedText = result.data.text;
      this.logger.log(`Tesseract OCR extracted text: ${extractedText.substring(0, 200)}...`);
      
      // Parse the extracted text
      return this.parseReceiptText(extractedText);
      
    } catch (error) {
      this.logger.error('Tesseract.js OCR fallback parsing failed', error);
      
      // Return basic fallback if OCR fails
      return {
        date: new Date().toLocaleDateString(),
        currency: 'USD',
        vendor_name: 'Unknown Vendor (OCR failed)',
        receipt_items: [{ item_name: 'Receipt Items', item_cost: 0 }],
        tax: 0,
        total: 0,
      };
    }
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      if (this.visionClient) {
        // Test with a minimal image
        const testBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
        await this.visionClient.textDetection({ image: { content: testBuffer.toString('base64') } });
        return true;
      }
      return true; // Fallback mode is healthy
    } catch (error) {
      this.logger.error('AI service health check failed', error);
      return false;
    }
  }
}
