# R2 License API

A Node.js API service that validates software licenses and generates signed download URLs from Cloudflare R2 storage. Built with Express.js and AWS SDK for S3-compatible R2 operations.

## 🚀 Features

- License validation with domain and file restrictions
- Secure signed URL generation for R2 downloads
- CORS enabled for web applications
- Environment-based configuration
- RESTful API endpoints

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- npm (comes with Node.js)
- Cloudflare R2 account and bucket
- R2 API tokens with read access

## 🛠 Installation

### Step 1: Clone the repository
```bash
git clone <your-repo-url>
cd r2-cloudflare-node-api
```

### Step 2: Install dependencies
```bash
npm install
```

### Step 3: Environment setup
```bash
# Copy the example environment file
cp .env-exam .env

# Edit .env with your actual values
nano .env
```

### Step 4: Configure environment variables

Edit your `.env` file with the following variables:

```env
PORT=3000

# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET=your_bucket_name
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

## 🔧 Usage

### Start the development server
```bash
npm run dev
```

### Start the production server
```bash
npm start
```

The API will be available at `http://localhost:3000`

## 📡 API Endpoints

### POST `/download`

Validates a license and returns a signed download URL for the requested file.

**Request Body:**
```json
{
  "license": "ABC-123-XYZ",
  "domain": "example.com",
  "file": "package-install__woozio-main.zip"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "License & domain valid",
  "data": {
    "url": "https://your-bucket.r2.cloudflarestorage.com/package-install__woozio-main.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&..."
  }
}
```

**Error Responses:**

- **400 Bad Request:** Missing required parameters
```json
{
  "success": false,
  "error": "Missing license, domain, or file"
}
```

- **403 Forbidden:** Invalid license, expired, or domain/file not allowed
```json
{
  "success": false,
  "error": "License not found"
}
```

- **500 Internal Server Error:** R2 connection or signing error
```json
{
  "success": false,
  "error": "Failed to generate download URL"
}
```

## 🔐 License Validation

The API validates licenses against the following criteria:
- License exists in the system
- License is active
- License has not expired
- Requesting domain is in the allowed domains list
- Requested file is in the allowed files list

## 🗂 Project Structure

```
r2-cloudflare-node-api/
├── index.js           # Main application file
├── package.json       # Dependencies and scripts
├── .env-exam          # Environment variables template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## 📦 Dependencies

- `express` - Web framework
- `@aws-sdk/client-s3` - AWS S3 client for R2
- `@aws-sdk/s3-request-presigner` - URL signing utilities
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management

## 🔒 Security Notes

- Signed URLs expire after 10 minutes
- All license validation is performed server-side
- Environment variables should never be committed to version control
- Use HTTPS in production environments

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.