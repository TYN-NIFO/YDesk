import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'test') dotenv.config({ path: './config.env' });

class SendGridEmailService {
  constructor() {
    this.initialized = false;
    this.initializeSendGrid();
  }

  initializeSendGrid() {
    try {
      const apiKey = process.env.SENDGRID_API_KEY;
      
      console.log('🔑 SendGrid API Key loaded:', {
        hasKey: !!apiKey,
        provider: 'SendGrid'
      });
      
      if (!apiKey) {
        console.warn('⚠️ SENDGRID_API_KEY not configured. Email sending will be disabled.');
        return;
      }

      sgMail.setApiKey(apiKey);
      this.initialized = true;
      
      console.log('✅ SendGrid Email Service initialized successfully');
      console.log('📧 Email Service Config:', {
        from: process.env.SMTP_FROM || process.env.EMAIL_FROM,
        provider: 'SendGrid',
        frontendUrl: process.env.FRONTEND_URL
      });
    } catch (error) {
      console.error('❌ Failed to initialize SendGrid:', error);
    }
  }

  async sendPasswordResetEmail(email, resetToken, userName) {
    try {
      if (!this.initialized) {
        console.error('❌ SendGrid not initialized. Cannot send email.');
        throw new Error('Email service not configured');
      }

      console.log('📧 Attempting to send password reset email via SendGrid:', {
        to: email,
        userName: userName,
        frontendUrl: process.env.FRONTEND_URL,
        timestamp: new Date().toISOString()
      });

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      const expiryTime = '1 hour';

      const msg = {
        to: email,
        from: {
          email: process.env.SMTP_FROM || process.env.EMAIL_FROM,
          name: 'The Yellow Network Claims'
        },
        subject: 'Password Reset Request - Claims Management System',
        text: this.getPasswordResetTextVersion(userName, resetUrl, expiryTime),
        html: this.getPasswordResetTemplate(userName, resetUrl, expiryTime),
      };

      console.log('📧 Sending email via SendGrid API...');
      const response = await sgMail.send(msg);
      
      console.log('✅ Password reset email sent successfully via SendGrid:', {
        to: email,
        statusCode: response[0].statusCode,
        headers: response[0].headers
      });

      return { success: true, provider: 'SendGrid', statusCode: response[0].statusCode };
    } catch (error) {
      console.error('❌ Error sending password reset email via SendGrid:', {
        error: error.message,
        code: error.code,
        to: email,
        response: error.response?.body,
        details: error.response?.body?.errors || 'No detailed errors'
      });
      throw new Error('Failed to send password reset email');
    }
  }

  getPasswordResetTemplate(userName, resetUrl, expiryTime) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
            color: #333;
          }
          .message {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.8;
          }
          .button-container {
            text-align: center;
            margin: 35px 0;
          }
          .reset-button {
            display: inline-block;
            padding: 14px 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
          }
          .alternative-link {
            margin-top: 25px;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 6px;
            word-break: break-all;
            font-size: 12px;
            color: #666;
          }
          .expiry-notice {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 25px 0;
            border-radius: 4px;
          }
          .security-notice {
            background-color: #f8f9fa;
            padding: 20px;
            margin-top: 30px;
            border-radius: 6px;
            border-left: 4px solid #6c757d;
          }
          .security-notice p {
            margin: 5px 0;
            font-size: 14px;
            color: #666;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 25px;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          
          <div class="content">
            <div class="greeting">
              Hello${userName ? ' ' + userName : ''},
            </div>
            
            <div class="message">
              We received a request to reset your password for your Claims Management System account. 
              Click the button below to create a new password.
            </div>
            
            <div class="button-container">
              <a href="${resetUrl}" class="reset-button">Reset Password</a>
            </div>
            
            <div class="alternative-link">
              <strong>Or copy and paste this link into your browser:</strong><br>
              <a href="${resetUrl}">${resetUrl}</a>
            </div>
            
            <div class="expiry-notice">
              <strong>⏰ Important:</strong> This password reset link will expire in <strong>${expiryTime}</strong>.
            </div>
            
            <div class="security-notice">
              <p><strong>🔒 Security Information:</strong></p>
              <p>• If you didn't request this password reset, please ignore this email.</p>
              <p>• Your password will not change until you create a new one using the link above.</p>
              <p>• For security reasons, never share your password or this reset link with anyone.</p>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from Claims Management System.</p>
            <p>© ${new Date().getFullYear()} The Yellow Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPasswordResetTextVersion(userName, resetUrl, expiryTime) {
    return `
Password Reset Request

Hello${userName ? ' ' + userName : ''},

We received a request to reset your password for your Claims Management System account.

To reset your password, please click the following link:
${resetUrl}

This link will expire in ${expiryTime}.

SECURITY INFORMATION:
- If you didn't request this password reset, please ignore this email.
- Your password will not change until you create a new one using the link above.
- For security reasons, never share your password or this reset link with anyone.

This is an automated message from Claims Management System.
© ${new Date().getFullYear()} The Yellow Network. All rights reserved.
    `;
  }

  async sendPasswordResetConfirmation(email, userName) {
    try {
      if (!this.initialized) {
        console.error('❌ SendGrid not initialized. Cannot send email.');
        return { success: false, error: 'Email service not configured' };
      }

      const msg = {
        to: email,
        from: {
          email: process.env.SMTP_FROM || process.env.EMAIL_FROM,
          name: 'The Yellow Network Claims'
        },
        subject: 'Password Successfully Reset - Claims Management System',
        text: this.getPasswordResetConfirmationTextVersion(userName),
        html: this.getPasswordResetConfirmationTemplate(userName),
      };

      console.log('📧 Sending password reset confirmation via SendGrid...');
      const response = await sgMail.send(msg);
      console.log('✅ Password reset confirmation email sent via SendGrid');
      
      return { success: true, provider: 'SendGrid', statusCode: response[0].statusCode };
    } catch (error) {
      console.error('❌ Error sending confirmation email via SendGrid:', error.message);
      return { success: false, error: error.message };
    }
  }

  getPasswordResetConfirmationTemplate(userName) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
          }
          .success-icon {
            text-align: center;
            font-size: 64px;
            margin-bottom: 20px;
          }
          .message {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.8;
            text-align: center;
          }
          .security-notice {
            background-color: #f8f9fa;
            padding: 20px;
            margin-top: 30px;
            border-radius: 6px;
            border-left: 4px solid #28a745;
          }
          .security-notice p {
            margin: 5px 0;
            font-size: 14px;
            color: #666;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 25px;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Password Reset Successful</h1>
          </div>
          
          <div class="content">
            <div class="success-icon">🎉</div>
            
            <div class="message">
              Hello${userName ? ' ' + userName : ''},<br><br>
              Your password has been successfully reset. You can now log in to your Claims Management System account using your new password.
            </div>
            
            <div class="security-notice">
              <p><strong>🔒 Security Alert:</strong></p>
              <p>• All your active sessions have been logged out for security.</p>
              <p>• If you didn't make this change, please contact support immediately.</p>
              <p>• We recommend using a strong, unique password for your account.</p>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from Claims Management System.</p>
            <p>© ${new Date().getFullYear()} The Yellow Network. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getPasswordResetConfirmationTextVersion(userName) {
    return `
Password Reset Successful

Hello${userName ? ' ' + userName : ''},

Your password has been successfully reset. You can now log in to your Claims Management System account using your new password.

SECURITY ALERT:
- All your active sessions have been logged out for security.
- If you didn't make this change, please contact support immediately.
- We recommend using a strong, unique password for your account.

This is an automated message from Claims Management System.
© ${new Date().getFullYear()} The Yellow Network. All rights reserved.
    `;
  }

  // Send a prepared notification email (used by grievance notifications)
  async sendEmail({ to, subject, html, text }) {
    if (!this.initialized) {
      throw new Error('SendGrid not configured');
    }
    const response = await sgMail.send({
      to,
      from: {
        email: process.env.SMTP_FROM || process.env.EMAIL_FROM,
        name: 'YDesk'
      },
      subject,
      html,
      text
    });
    return { success: true, provider: 'SendGrid', statusCode: response[0].statusCode };
  }
}

export default new SendGridEmailService();

