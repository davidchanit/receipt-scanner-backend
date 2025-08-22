# Receipt Scanner Backend

A robust NestJS backend service that provides AI-powered receipt data extraction. Built with TypeScript, NestJS, and integrates with Google Cloud Vision API and Tesseract.js OCR for reliable text extraction.

## 🚀 Features

- **AI-Powered Extraction**: Google Cloud Vision API integration for accurate receipt analysis
- **OCR Fallback**: Tesseract.js OCR as backup when AI service is unavailable
- **File Management**: Secure file upload and storage with validation
- **Data Persistence**: SQLite database with TypeORM for receipt storage
- **RESTful API**: Clean, documented endpoints for receipt processing
- **Error Handling**: Comprehensive error handling with meaningful responses
- **Health Monitoring**: Built-in health checks for service monitoring

## 🛠️ Tech Stack

- **NestJS 11** - Progressive Node.js framework
- **TypeScript** - Type-safe development
- **TypeORM** - Database ORM with SQLite
- **Google Cloud Vision** - Primary AI service for text extraction
- **Tesseract.js** - OCR fallback for text extraction
- **Multer** - File upload handling
- **Class Validator** - Request validation
- **Jest** - Testing framework

## 📋 Prerequisites

Before running this application, ensure you have:

- **Node.js** (version 18 or higher)
- **npm** or **yarn** package manager
- **Google Cloud Vision API** credentials (optional, falls back to OCR)

## 🔑 Environment Setup

### 1. Google Cloud Vision API (Optional but Recommended)

For optimal performance, set up Google Cloud Vision API:

1. Create a Google Cloud project
2. Enable the Vision API
3. Create a service account and download credentials
4. Set environment variables:

```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLOUD_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
```

**Note**: If credentials are not provided, the service will automatically use Tesseract.js OCR fallback.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd receipt-scanner-backend
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3001

# Google Cloud Vision (Optional)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PRIVATE_KEY="your-private-key"
GOOGLE_CLOUD_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com

# Database Configuration
DB_TYPE=sqlite
DB_DATABASE=receipts.db
```

### 3. Start the Application

**Development Mode:**

```bash
npm run start:dev
```

**Production Mode:**

```bash
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3001`.

## 📁 Project Structure

```
src/
├── modules/
│   ├── ai/              # AI service with Google Vision + Tesseract
│   ├── receipt/         # Receipt processing and management
│   └── storage/         # File upload and storage management
├── common/              # Shared utilities and interfaces
├── config/              # Configuration management
└── main.ts             # Application entry point
```

## 🌐 API Endpoints

### Receipt Processing

#### `POST /receipt/extract-receipt-details`

Extract receipt information from an uploaded image.

**Request:**

- Content-Type: `multipart/form-data`
- Body: `image` file (JPG, JPEG, PNG, max 10MB)

**Response:**

```json
{
  "id": "uuid",
  "date": "2024-01-15",
  "currency": "USD",
  "vendor_name": "Store Name",
  "receipt_items": [
    {
      "item_name": "Product Name",
      "item_cost": 29.99
    }
  ],
  "tax": 2.99,
  "total": 32.98,
  "image_url": "/uploads/filename.jpg"
}
```

### Receipt Management

#### `GET /receipt/:id`

Get receipt by ID.

#### `GET /receipt`

Get all receipts (ordered by creation date).

#### `DELETE /receipt/:id`

Delete receipt and associated image.

### Health Monitoring

#### `GET /receipt/health/check`

Check service health status.

## 🔧 Configuration

### Environment Variables

| Variable                    | Description                        | Default |
| --------------------------- | ---------------------------------- | ------- |
| `PORT`                      | Server port                        | `3001`  |
| `GOOGLE_CLOUD_PROJECT_ID`   | Google Cloud project ID            | -       |
| `GOOGLE_CLOUD_PRIVATE_KEY`  | Google Cloud private key           | -       |
| `GOOGLE_CLOUD_CLIENT_EMAIL` | Google Cloud service account email | -       |

### File Upload Limits

- **Supported Formats**: JPG, JPEG, PNG
- **Maximum Size**: 10MB
- **Storage**: Local `uploads/` directory

### Database

- **Type**: SQLite (development)
- **File**: `receipts.db`
- **Migrations**: Automatic schema creation

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:cov
```

Run end-to-end tests:

```bash
npm run test:e2e
```

## 🏗️ Building

Build the application:

```bash
npm run build
```

The compiled application will be in the `dist/` directory.

## 🚀 Deployment

### Development

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

### Docker (Recommended for Production)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY uploads ./uploads

EXPOSE 3001

CMD ["npm", "run", "start:prod"]
```

## 🔒 Security Features

- **File Validation**: MIME type and extension validation
- **Size Limits**: Configurable file size restrictions
- **Secure Filenames**: UUID-based file naming
- **CORS Configuration**: Configurable cross-origin settings
- **Input Validation**: Request payload validation

## 📊 Monitoring

### Health Checks

The service provides built-in health monitoring:

- Database connectivity
- AI service availability
- File storage accessibility

### Logging

Comprehensive logging with different levels:

- Debug: Detailed operation information
- Info: General application flow
- Warn: Potential issues
- Error: Error conditions

## 🐛 Troubleshooting

### Common Issues

1. **Google Cloud Vision API Errors**
   - Verify credentials and permissions
   - Check API quota and billing
   - Service will fall back to OCR automatically

2. **File Upload Issues**
   - Check file format and size
   - Verify uploads directory permissions
   - Check disk space

3. **Database Issues**
   - Verify SQLite file permissions
   - Check database file integrity
   - Restart service if needed

4. **Port Conflicts**
   - Change PORT environment variable
   - Check if port 3001 is available
   - Use `lsof -i :3001` to check port usage

### Logs

Check application logs for detailed error information:

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

## 🔗 Frontend Integration

This backend is designed to work with the Receipt Scanner Frontend:

- **CORS**: Configured for `http://localhost:3000`
- **File Upload**: Optimized for React FormData
- **Error Handling**: Structured error responses for frontend display

## 📱 API Documentation

For detailed API documentation, start the service and visit:

- **Swagger UI**: Not configured (can be added with `@nestjs/swagger`)
- **Health Check**: `http://localhost:3001/receipt/health/check`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and quality checks
5. Submit a pull request

## 📄 License

This project is part of the Sleek Full Stack Engineer assessment.

## 🆘 Support

For technical support or questions:

- Check the troubleshooting section above
- Review the application logs
- Contact the development team

---

**Note**: This backend service is required for the Receipt Scanner Frontend to function properly. Ensure both services are running for full functionality.
