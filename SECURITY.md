# Security Policy

## Overview

This document outlines the security measures implemented in the Expense Tracker API and provides guidance for secure deployment and operation.

## Security Features

### 1. Authentication & Authorization

#### API Key Authentication
- All REST API endpoints (except `/health` and Telegram webhook) require API key authentication
- API keys are passed via `X-API-Key` header
- Configure API keys via `API_KEYS` environment variable (comma-separated)

#### User Authorization
- Users are validated against `ALLOWED_USERS` list
- Telegram access is controlled via `ALLOWED_CHAT_IDS`
- User parameter validation on all data-access endpoints

### 2. Rate Limiting

- General API endpoints: 60 requests/minute
- Debug/test endpoints: 10 requests/minute
- Expense listing: 30 requests/minute
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

### 3. Security Headers

All responses include:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

### 4. CORS Configuration

- Production: Only allows origins specified in `CORS_ORIGINS`
- Development: Allows all origins (for local development only)
- Credentials supported
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS

### 5. Input Validation

#### Request Size Limits
- API endpoints: 100KB max
- OCR/image uploads: 10MB max
- CSV uploads: 5MB max

#### Input Sanitization
- SQL queries use parameterized statements
- User inputs are validated and sanitized
- Telegram Markdown/HTML content is escaped

### 6. Database Security

- Parameterized queries prevent SQL injection
- Connection pooling with timeouts
- Query timeout: 30 seconds
- Connection timeout: 10 seconds
- Statement timeout prevents long-running queries

### 7. Error Handling

- Production errors are sanitized (no stack traces or internal details)
- Development mode provides detailed error messages
- Security-relevant events are logged for audit

## Environment Configuration

### Required Variables

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=<your_bot_token>
ALLOWED_CHAT_IDS=<comma_separated_chat_ids>

# AI APIs
OPENROUTER_API_KEY=<your_openrouter_key>

# Database
DATABASE_URL=<postgresql_connection_string>
```

### Security Variables

```env
# API authentication (required for production)
API_KEYS=<comma_separated_api_keys>

# User authorization
ALLOWED_USERS=User1,User2

# CORS (required for production)
CORS_ORIGINS=https://your-frontend.com

# Environment mode
NODE_ENV=production
```

## Production Deployment Checklist

### Before Deployment

- [ ] Set `NODE_ENV=production`
- [ ] Configure `API_KEYS` with strong, unique keys
- [ ] Set `CORS_ORIGINS` to allowed domains only
- [ ] Use strong database password (not 'test')
- [ ] Remove or rotate any development tokens
- [ ] Review `ALLOWED_CHAT_IDS` and `ALLOWED_USERS`

### Secrets Management

1. **Never commit secrets to version control**
   - `.env` is gitignored
   - Use `.env.example` as template only

2. **Rotate credentials regularly**
   - Telegram bot tokens
   - API keys (OpenRouter, Groq)
   - Database passwords
   - API authentication keys

3. **Use secrets management for production**
   - HashiCorp Vault
   - AWS Secrets Manager
   - Google Secret Manager
   - Azure Key Vault

### Network Security

1. **Use HTTPS in production**
   - TLS 1.3 recommended
   - HSTS enabled

2. **Firewall configuration**
   - Only expose necessary ports
   - Restrict database access to application only

3. **Telegram webhook**
   - Verify requests originate from Telegram
   - Use HTTPS for webhook URL

## Vulnerability Reporting

If you discover a security vulnerability, please:

1. **Do not** create a public GitHub issue
2. Email security concerns privately to the maintainer
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Updates

Keep dependencies updated:

```bash
bun update
```

Check for vulnerabilities:

```bash
bun audit  # or npm audit
```

## Audit Logging

Security events are logged:
- Failed authentication attempts
- Rate limit violations
- Unauthorized access attempts
- Error conditions

Review logs regularly for suspicious activity.

## Incident Response

1. **Immediate Actions**
   - Revoke compromised credentials
   - Block malicious IPs if identified
   - Review audit logs

2. **Investigation**
   - Determine scope of compromise
   - Identify attack vector
   - Assess data exposure

3. **Recovery**
   - Rotate all affected credentials
   - Patch vulnerabilities
   - Notify affected users if required

## Compliance Notes

- **GDPR**: User expense data is personal financial information
  - Implement data retention policies
  - Provide data export on request
  - Document data processing purposes

- **Security Best Practices**
  - Follow OWASP guidelines
  - Regular security assessments
  - Keep dependencies updated
