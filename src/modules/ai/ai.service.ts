import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';

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
  private openaiClient: OpenAI | null = null;

  constructor() {
    this.initializeClients();
  }

  private async initializeClients(): Promise<void> {
    try {
      // Initialize OpenAI client for GPT-4 Vision
      if (process.env.OPENAI_API_KEY) {
        this.openaiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        this.logger.log('OpenAI client initialized successfully');
      } else {
        this.logger.warn('OpenAI API key not found, GPT-4 Vision will not be available');
      }

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
        this.logger.warn('Google Cloud Vision credentials not found');
      }
    } catch (error) {
      this.logger.error('Failed to initialize AI clients', error);
    }
  }

  async extractReceiptData(imageBuffer: Buffer): Promise<ExtractedReceiptData> {
    try {
      this.logger.log('Starting receipt data extraction');
      
      // Try GPT-4 Vision first (most intelligent)
      if (this.openaiClient) {
        try {
          this.logger.log('Using GPT-4 Vision for intelligent extraction');
          return await this.extractWithGpt4Vision(imageBuffer);
        } catch (error) {
          this.logger.warn('GPT-4 Vision failed, falling back to Google Vision', error);
        }
      }
      
      // Fallback to Google Cloud Vision
      if (this.visionClient) {
        try {
          this.logger.log('Using Google Cloud Vision API for extraction');
          return await this.extractWithVisionApi(imageBuffer);
        } catch (error) {
          this.logger.warn('Google Cloud Vision failed, falling back to Tesseract', error);
        }
      }
      
      // Final fallback to Tesseract.js
      this.logger.log('Using Tesseract.js OCR fallback parsing');
      return await this.fallbackParsing(imageBuffer);
    } catch (error) {
      this.logger.error('All AI services failed, using Tesseract.js OCR', error);
      return await this.fallbackParsing(imageBuffer);
    }
  }

  private async extractWithGpt4Vision(imageBuffer: Buffer): Promise<ExtractedReceiptData> {
    try {
      // Convert image to base64
      const imageBase64 = imageBuffer.toString('base64');
      
      const prompt = `Extract the following information from this receipt image and return ONLY a valid JSON object:

{
  "date": "extracted date in YYYY-MM-DD format",
  "currency": "3-letter currency code (USD, EUR, CHF, etc.)",
  "vendor_name": "store/business name",
  "receipt_items": [
    {"item_name": "item name", "item_cost": price}
  ],
  "tax": tax_amount,
  "total": total_amount
}

Important:
- Return ONLY the JSON, no other text
- Ensure all numbers are numeric (not strings)
- If any field cannot be extracted, use reasonable defaults
- Ensure the JSON is valid and parseable`;

      const response = await this.openaiClient!.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
      });

      const extractedText = response.choices[0]?.message?.content;
      if (!extractedText) {
        throw new Error('No response from GPT-4 Vision');
      }

      this.logger.debug(`GPT-4 Vision response: ${extractedText.substring(0, 200)}...`);

      // Try to parse the JSON response
      try {
        const parsedData = JSON.parse(extractedText);
        
        // Validate and transform the data
        return this.validateAndTransformGptResponse(parsedData);
      } catch (parseError) {
        this.logger.error('Failed to parse GPT-4 Vision JSON response', parseError);
        throw new Error('Invalid response format from GPT-4 Vision');
      }
    } catch (error) {
      this.logger.error('GPT-4 Vision extraction failed', error);
      throw new InternalServerErrorException('GPT-4 Vision service temporarily unavailable');
    }
  }

  private validateAndTransformGptResponse(data: any): ExtractedReceiptData {
    // Ensure all required fields exist with proper types
    const validatedData: ExtractedReceiptData = {
      date: data.date || new Date().toISOString().split('T')[0],
      currency: data.currency || 'USD',
      vendor_name: data.vendor_name || 'Unknown Vendor',
      receipt_items: Array.isArray(data.receipt_items) 
        ? data.receipt_items.map((item: any) => ({
            item_name: item.item_name || 'Unknown Item',
            item_cost: typeof item.item_cost === 'number' ? item.item_cost : 0
          }))
        : [{ item_name: 'General Items', item_cost: 0 }],
      tax: typeof data.tax === 'number' ? data.tax : 0,
      total: typeof data.total === 'number' ? data.total : 0
    };

    // Ensure receipt_items is not empty
    if (validatedData.receipt_items.length === 0) {
      validatedData.receipt_items = [{ item_name: 'General Items', item_cost: 0 }];
    }

    // If total is 0 but we have items, calculate it
    if (validatedData.total === 0 && validatedData.receipt_items.length > 0) {
      const subtotal = validatedData.receipt_items.reduce((sum, item) => sum + item.item_cost, 0);
      validatedData.total = subtotal + validatedData.tax;
    }

    return validatedData;
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
