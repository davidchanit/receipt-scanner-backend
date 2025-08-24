# Receipt Scanner Backend

A NestJS backend service that extracts receipt information using AI-powered image analysis.

## Features

- **AI-Powered Receipt Extraction**: Uses GPT-4 Vision for intelligent receipt parsing
- **Multiple AI Fallbacks**: GPT-4 Vision → Google Cloud Vision → Tesseract.js OCR
- **Automatic Field Detection**: Extracts date, currency, vendor, items, tax, and total
- **Image Storage**: Secure file upload and storage management
- **RESTful API**: Clean endpoints for receipt processing
- **Comprehensive Testing**: Full test coverage for all functionality

## AI Service Architecture

The AI service uses a **tiered approach** for maximum reliability:

### 1. **GPT-4 Vision (Primary)**

- **Cost**: Free tier available (limited usage)
- **Accuracy**: Very high - understands context and receipt structure
- **Features**:
  - Automatic field extraction
  - Context-aware parsing
  - Handles various receipt formats
  - Returns structured JSON data

### 2. **Google Cloud Vision (Fallback)**

- **Cost**: 1,000 free requests/month
- **Accuracy**: High for text extraction
- **Features**: OCR + pattern matching

### 3. **Tesseract.js (Final Fallback)**

- **Cost**: 100% free
- **Accuracy**: Good for clear text
- **Features**: Local OCR processing

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key (for GPT-4 Vision)

### Environment Variables

Create a `.env` file in the root directory:

```bash
# OpenAI API Configuration (Required for GPT-4 Vision)
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=password
DB_DATABASE=receipt_scanner

# Application Configuration
PORT=3001
NODE_ENV=development
```

### Getting OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key to your `.env` file

**Note**: GPT-4 Vision has a free tier with limited usage. Check OpenAI's pricing for current limits.

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run start:dev

# Run tests
npm test

# Build for production
npm run build
```

## API Endpoints

### Extract Receipt Details

```
POST /receipt/extract-receipt-details
Content-Type: multipart/form-data

Body: image file (jpg, jpeg, png)
```

**Response:**

```json
{
  "id": "uuid",
  "date": "2024-01-15",
  "currency": "USD",
  "vendor_name": "Walmart",
  "receipt_items": [
    { "item_name": "Milk", "item_cost": 3.99 },
    { "item_name": "Bread", "item_cost": 2.49 }
  ],
  "tax": 0.65,
  "total": 7.13,
  "image_url": "/uploads/filename.jpg"
}
```

## How GPT-4 Vision Works

1. **Image Upload**: Receipt image is converted to base64
2. **AI Analysis**: GPT-4 Vision analyzes the image with a structured prompt
3. **JSON Response**: AI returns structured data in JSON format
4. **Validation**: Response is validated and transformed to match expected format
5. **Fallback**: If GPT-4 Vision fails, falls back to other AI services

### Example GPT-4 Vision Prompt

```
Extract the following information from this receipt image and return ONLY a valid JSON object:

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
```

## Benefits of GPT-4 Vision

✅ **No Pattern Matching**: AI understands receipt structure automatically  
✅ **High Accuracy**: Context-aware extraction  
✅ **Multiple Formats**: Handles various receipt layouts  
✅ **Intelligent Parsing**: Understands abbreviations and variations  
✅ **Structured Output**: Returns clean, validated JSON data

## Cost Considerations

- **GPT-4 Vision**: Free tier available, then pay-per-use
- **Google Cloud Vision**: 1,000 free requests/month
- **Tesseract.js**: 100% free forever

## Testing

The service includes comprehensive tests covering:

- Successful extraction scenarios
- File type validation
- AI response validation
- Error handling (500 status responses)
- Fallback mechanisms

Run tests with:

```bash
npm test
```

## Project Structure

```
src/
├── modules/
│   ├── ai/              # AI service with GPT-4 Vision + Google Vision + Tesseract
│   ├── receipt/         # Receipt processing and storage
│   └── storage/         # Image file management
├── common/              # Shared utilities and interfaces
└── config/              # Configuration management
```
