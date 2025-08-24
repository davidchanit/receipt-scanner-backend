#!/usr/bin/env node

/**
 * GPT-4 Vision Receipt Scanner Demo
 * 
 * This script demonstrates how to use the GPT-4 Vision integration
 * for intelligent receipt extraction without pattern matching.
 * 
 * Prerequisites:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Have a receipt image file ready
 * 
 * Usage:
 * node demo-gpt4-vision.js <path-to-receipt-image>
 */

const fs = require('fs');
const path = require('path');

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is not set');
  console.log('\nTo set it up:');
  console.log('1. Go to https://platform.openai.com/');
  console.log('2. Create an account and get your API key');
  console.log('3. Set the environment variable:');
  console.log('   export OPENAI_API_KEY="your-api-key-here"');
  process.exit(1);
}

// Check if image path is provided
if (process.argv.length < 3) {
  console.error('❌ Please provide a path to a receipt image');
  console.log('\nUsage: node demo-gpt4-vision.js <path-to-receipt-image>');
  console.log('\nExample: node demo-gpt4-vision.js ./receipt.jpg');
  process.exit(1);
}

const imagePath = process.argv[2];

// Check if image file exists
if (!fs.existsSync(imagePath)) {
  console.error(`❌ Image file not found: ${imagePath}`);
  process.exit(1);
}

// Check file extension
const allowedExtensions = ['.jpg', '.jpeg', '.png'];
const fileExt = path.extname(imagePath).toLowerCase();
if (!allowedExtensions.includes(fileExt)) {
  console.error(`❌ File extension ${fileExt} is not supported`);
  console.log(`Supported formats: ${allowedExtensions.join(', ')}`);
  process.exit(1);
}

console.log('🚀 GPT-4 Vision Receipt Scanner Demo');
console.log('=====================================\n');

console.log(`📸 Processing image: ${imagePath}`);
console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY.substring(0, 8)}...`);
console.log('');

// Simulate the GPT-4 Vision prompt that would be used
console.log('🤖 GPT-4 Vision Prompt:');
console.log('Extract the following information from this receipt image and return ONLY a valid JSON object:');
console.log('');
console.log('{');
console.log('  "date": "extracted date in YYYY-MM-DD format",');
console.log('  "currency": "3-letter currency code (USD, EUR, CHF, etc.)",');
console.log('  "vendor_name": "store/business name",');
console.log('  "receipt_items": [');
console.log('    {"item_name": "item name", "item_cost": price}');
console.log('  ],');
console.log('  "tax": tax_amount,');
console.log('  "total": total_amount');
console.log('}');
console.log('');

console.log('✨ Benefits of GPT-4 Vision:');
console.log('✅ No pattern matching required');
console.log('✅ Understands context and receipt structure');
console.log('✅ Handles various receipt formats automatically');
console.log('✅ Intelligent parsing of abbreviations and variations');
console.log('✅ Returns clean, structured JSON data');
console.log('');

console.log('🔄 Fallback Strategy:');
console.log('1. GPT-4 Vision (Primary - Most Intelligent)');
console.log('2. Google Cloud Vision (Fallback - OCR + Pattern Matching)');
console.log('3. Tesseract.js (Final Fallback - Local OCR)');
console.log('');

console.log('💰 Cost Considerations:');
console.log('- GPT-4 Vision: Free tier available, then pay-per-use');
console.log('- Google Cloud Vision: 1,000 free requests/month');
console.log('- Tesseract.js: 100% free forever');
console.log('');

console.log('📋 To test with your actual receipt:');
console.log('1. Start the backend: npm run start:dev');
console.log('2. Send a POST request to /receipt/extract-receipt-details');
console.log('3. Include your receipt image in the request');
console.log('4. The service will automatically use GPT-4 Vision if available');
console.log('');

console.log('🎯 The AI will automatically:');
console.log('- Analyze the receipt image');
console.log('- Extract all required fields');
console.log('- Return structured JSON data');
console.log('- Handle edge cases and missing information');
console.log('- Provide reasonable defaults when needed');
console.log('');

console.log('🚀 Ready to scan receipts with AI intelligence!');
