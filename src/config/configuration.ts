export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    database: process.env.DB_DATABASE || 'receipts.db',
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
  },
  fileUpload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    uploadDest: process.env.UPLOAD_DEST || './uploads',
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
  },
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    privateKey: process.env.GOOGLE_CLOUD_PRIVATE_KEY,
    clientEmail: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
  },
});
