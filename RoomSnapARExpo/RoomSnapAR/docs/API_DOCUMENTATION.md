# RoomSnap AR API Documentation

## Base URL
```
Production: https://api.roomsnap.app/v1
Staging: https://staging-api.roomsnap.app/v1
Development: http://localhost:3000/v1
```

## Authentication
All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

## Response Format
All responses follow this format:
```json
{
  "success": boolean,
  "data": object | array,
  "error": string,
  "message": string,
  "statusCode": number
}
```

## Rate Limiting
- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

---

# Endpoints

## Authentication

### Register
`POST /auth/register`

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "platform": "mobile",
  "deviceInfo": {
    "model": "iPhone 14",
    "os": "iOS",
    "version": "16.0"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "token": "jwt_token",
    "refreshToken": "refresh_token"
  }
}
```

### Login
`POST /auth/login`

Authenticate user and receive access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "twoFactorCode": "123456",
  "rememberMe": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "user",
      "subscription": "pro"
    },
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "expiresIn": 3600
  }
}
```

### Logout
`POST /auth/logout`

Invalidate current session.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Refresh Token
`POST /auth/refresh`

Get new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "new_jwt_token",
    "refreshToken": "new_refresh_token",
    "expiresIn": 3600
  }
}
```

### Request Password Reset
`POST /auth/password/reset-request`

Send password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reset instructions sent to email"
}
```

### Reset Password
`POST /auth/password/reset`

Reset password using token from email.

**Request Body:**
```json
{
  "token": "reset_token",
  "newPassword": "NewSecurePassword123!"
}
```

### Enable 2FA
`POST /auth/2fa/enable`

Enable two-factor authentication.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,...",
    "backupCodes": ["code1", "code2", "..."]
  }
}
```

---

## User Management

### Get Profile
`GET /users/profile`

Get current user's profile.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": "https://cdn.roomsnap.app/avatars/user_123.jpg",
    "subscription": {
      "plan": "pro",
      "status": "active",
      "expiresAt": "2024-12-31T23:59:59Z"
    },
    "preferences": {
      "units": "metric",
      "notifications": true,
      "theme": "light"
    }
  }
}
```

### Update Profile
`PUT /users/profile`

Update user profile information.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Jane Doe",
  "preferences": {
    "units": "imperial",
    "notifications": false
  }
}
```

### Upload Avatar
`POST /users/avatar`

Upload user avatar image.

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `avatar`: Image file (max 5MB, JPEG/PNG)

### Delete Account
`DELETE /users/account`

Permanently delete user account (GDPR compliant).

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "reason": "No longer needed",
  "feedback": "Optional feedback"
}
```

---

## Subscriptions

### Get Subscription Status
`GET /subscriptions/status`

Get current subscription details.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "pro",
    "status": "active",
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z",
    "autoRenew": true,
    "features": [
      "unlimited_measurements",
      "ai_assistance",
      "cloud_sync"
    ]
  }
}
```

### Create Subscription
`POST /subscriptions/create`

Create new subscription.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "planId": "pro_monthly",
  "paymentMethodId": "pm_123456"
}
```

### Cancel Subscription
`POST /subscriptions/cancel`

Cancel active subscription.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "reason": "Too expensive",
  "immediately": false
}
```

### Get Invoices
`GET /subscriptions/invoices`

Get subscription invoices.

**Headers:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `limit`: Number of results (default: 10, max: 100)
- `offset`: Pagination offset (default: 0)

---

## Payments

### Create Payment Intent
`POST /payments/create-intent`

Create Stripe payment intent.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "amount": 2999,
  "currency": "usd",
  "description": "Pro subscription"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "pi_123456",
    "clientSecret": "pi_123456_secret_abc",
    "amount": 2999,
    "currency": "usd"
  }
}
```

### Add Payment Method
`POST /payments/methods/add`

Add new payment method.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "type": "card",
  "details": {
    "number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2025,
    "cvc": "123"
  }
}
```

### Get Payment Methods
`GET /payments/methods`

List saved payment methods.

**Headers:**
- `Authorization: Bearer <token>`

---

## Projects & Measurements

### Create Project
`POST /projects/create`

Create new measurement project.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Living Room Renovation",
  "description": "Measurements for renovation",
  "type": "residential",
  "measurements": []
}
```

### Get Projects
`GET /projects`

List user's projects.

**Headers:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `limit`: Results per page (default: 20)
- `offset`: Pagination offset
- `sort`: Sort field (created, updated, name)
- `order`: Sort order (asc, desc)

### Get Project
`GET /projects/{projectId}`

Get specific project details.

**Headers:**
- `Authorization: Bearer <token>`

### Update Project
`PUT /projects/{projectId}`

Update project information.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Updated Project Name",
  "status": "completed"
}
```

### Delete Project
`DELETE /projects/{projectId}`

Delete project and all measurements.

**Headers:**
- `Authorization: Bearer <token>`

### Save Measurement
`POST /projects/{projectId}/measurements`

Add measurement to project.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "type": "distance",
  "value": 3.45,
  "unit": "meters",
  "points": [
    {"x": 0, "y": 0, "z": 0},
    {"x": 3.45, "y": 0, "z": 0}
  ],
  "label": "Wall Length",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Export Project
`GET /projects/{projectId}/export`

Export project data.

**Headers:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `format`: Export format (pdf, csv, json)

### Share Project
`POST /projects/{projectId}/share`

Share project with others.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "emails": ["colleague@example.com"],
  "permission": "view",
  "message": "Check out these measurements"
}
```

---

## AI Vision

### Analyze Image
`POST /ai/analyze`

Analyze image for measurements or furniture.

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `image`: Image file
- `mode`: Analysis mode (furniture, room, dimensions)

**Response:**
```json
{
  "success": true,
  "data": {
    "objects": [
      {
        "type": "sofa",
        "confidence": 0.95,
        "dimensions": {
          "width": 2.1,
          "height": 0.9,
          "depth": 0.8
        }
      }
    ],
    "roomType": "living_room",
    "suggestedLayout": "..."
  }
}
```

### Generate Suggestions
`POST /ai/suggestions/{projectId}`

Get AI suggestions for project.

**Headers:**
- `Authorization: Bearer <token>`

### Process Voice Command
`POST /ai/voice`

Process voice command.

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
- `audio`: Audio file (WAV/MP3)

---

## Analytics

### Track Event
`POST /analytics/track`

Track user event (GDPR compliant).

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "event": "measurement_created",
  "properties": {
    "type": "distance",
    "value": 3.45
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "sessionId": "session_123"
}
```

### Send Metrics
`POST /analytics/metrics`

Batch send performance metrics.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "metrics": [
    {
      "type": "app_launch",
      "duration": 1250,
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## Admin Endpoints

### Get Users
`GET /admin/users`

List all users (admin only).

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 50)
- `search`: Search query
- `role`: Filter by role
- `status`: Filter by status (active, suspended)

### Get User Details
`GET /admin/users/{userId}`

Get specific user details.

**Headers:**
- `Authorization: Bearer <admin_token>`

### Update User
`PUT /admin/users/{userId}`

Update user information.

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "role": "support",
  "subscription": "enterprise",
  "isActive": true
}
```

### Suspend User
`POST /admin/users/{userId}/suspend`

Suspend user account.

**Headers:**
- `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "reason": "Terms violation",
  "duration": 7,
  "notify": true
}
```

### Reset User Password
`POST /admin/users/{userId}/reset-password`

Force password reset for user.

**Headers:**
- `Authorization: Bearer <admin_token>`

### Get System Metrics
`GET /admin/metrics`

Get system metrics and statistics.

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `start`: Start date (ISO 8601)
- `end`: End date (ISO 8601)

### Get Audit Logs
`GET /admin/audit-logs`

Get system audit logs.

**Headers:**
- `Authorization: Bearer <admin_token>`

**Query Parameters:**
- `limit`: Number of logs (default: 100)
- `userId`: Filter by user
- `action`: Filter by action type

---

## Support

### Create Ticket
`POST /support/tickets`

Create support ticket.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "subject": "Cannot save measurements",
  "message": "Detailed description...",
  "category": "technical",
  "priority": "high"
}
```

### Get Tickets
`GET /support/tickets`

Get user's support tickets.

**Headers:**
- `Authorization: Bearer <token>`

### Reply to Ticket
`POST /support/tickets/{ticketId}/reply`

Add reply to ticket.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "message": "Reply message"
}
```

---

## Health & Status

### Health Check
`GET /health`

Check API health status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 3600
  }
}
```

### System Status
`GET /status`

Get system status and components.

**Response:**
```json
{
  "success": true,
  "data": {
    "api": "operational",
    "database": "operational",
    "redis": "operational",
    "storage": "operational",
    "payments": "operational"
  }
}
```

---

## Webhooks

### Stripe Webhook
`POST /webhooks/stripe`

Handle Stripe webhook events.

**Headers:**
- `Stripe-Signature: <signature>`

**Request Body:**
Stripe event object

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation error |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Error Response Format
```json
{
  "success": false,
  "error": "error_code",
  "message": "Human readable error message",
  "statusCode": 400,
  "details": {
    "field": "email",
    "reason": "Invalid format"
  }
}
```

---

## Security

### Headers
All requests should include:
- `X-Request-ID`: Unique request identifier
- `X-Platform`: Platform (mobile, web)
- `X-App-Version`: App version

### CORS
Allowed origins:
- `https://roomsnap.app`
- `https://app.roomsnap.app`
- `http://localhost:*` (development only)

### Rate Limiting
Rate limits are enforced per IP and per user:
- Anonymous: 20 req/min
- Authenticated: 100 req/min
- Pro users: 500 req/min
- Enterprise: Unlimited

### Data Privacy
- All data is encrypted at rest
- PII is automatically sanitized in logs
- GDPR/CCPA compliant
- Data retention: 90 days for analytics, 7 years for financial

---

## SDKs and Libraries

### JavaScript/TypeScript
```bash
npm install @roomsnap/api-client
```

### Python
```bash
pip install roomsnap-api
```

### Swift
```swift
import RoomSnapAPI
```

### Kotlin
```kotlin
implementation 'com.roomsnap:api-client:1.0.0'
```

---

## Changelog

### v1.0.0 (2024-01-15)
- Initial API release
- Authentication system
- Project management
- Measurement storage
- AI vision integration
- Payment processing
- Admin dashboard

---

## Support

For API support, contact:
- Email: api-support@roomsnap.app
- Documentation: https://docs.roomsnap.app
- Status Page: https://status.roomsnap.app