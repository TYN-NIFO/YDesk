import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'test') dotenv.config({ path: './config.env' });

class EmailService {
  constructor() {
    this.transporter = null;
    if (process.env.NODE_ENV !== 'test' && process.env.SMTP_HOST) this.initializeTransporter();
  }

  initializeTransporter() {
    if (process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY) {
      console.log('📧 Skipping SMTP initialization - an HTTPS email provider is configured');
      return;
    }

    try {
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const isSecure = smtpPort === 465; // Use secure for port 465
      
      console.log('📧 Initializing SMTP Email Service with config:', {
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: isSecure,
        user: process.env.SMTP_USER,
        from: process.env.SMTP_FROM,
        hasPassword: !!process.env.SMTP_PASS
      });
      
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: isSecure, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: true
        },
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000,
        logger: true, // Enable logging
        debug: process.env.NODE_ENV !== 'production' // Debug in development
      });

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ SMTP service verification failed:', {
            error: error.message,
            code: error.code,
            command: error.command,
            host: process.env.SMTP_HOST,
            port: smtpPort
          });
        } else {
          console.log('✅ SMTP service is ready to send messages');
        }
      });
    } catch (error) {
      console.error('❌ Failed to initialize SMTP transporter:', error);
    }
  }

  async sendPasswordResetEmail(email, resetToken, userName) {
    try {
      console.log('📧 Attempting to send password reset email:', {
        to: email,
        userName: userName,
        frontendUrl: process.env.FRONTEND_URL,
        timestamp: new Date().toISOString()
      });

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      const expiryTime = '1 hour';

      const mailOptions = {
        from: {
          name: 'The Yellow Network Claims',
          address: process.env.SMTP_FROM
        },
        to: email,
        subject: 'Password Reset Request - Claims Management System',
        html: this.getPasswordResetTemplate(userName, resetUrl, expiryTime),
        text: this.getPasswordResetTextVersion(userName, resetUrl, expiryTime)
      };

      console.log('📧 Connecting to SMTP server...');
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent successfully:', {
        messageId: info.messageId,
        to: email,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending password reset email:', {
        error: error.message,
        code: error.code,
        command: error.command,
        to: email,
        stack: error.stack
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
            transition: transform 0.2s;
          }
          .reset-button:hover {
            transform: translateY(-2px);
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
          .expiry-notice strong {
            color: #856404;
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
          .footer a {
            color: #667eea;
            text-decoration: none;
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
      const mailOptions = {
        from: {
          name: 'The Yellow Network Claims',
          address: process.env.SMTP_FROM
        },
        to: email,
        subject: 'Password Successfully Reset - Claims Management System',
        html: this.getPasswordResetConfirmationTemplate(userName),
        text: this.getPasswordResetConfirmationTextVersion(userName)
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset confirmation email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending password reset confirmation email:', error);
      // Don't throw error here as password was already reset
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
    if (!this.transporter) {
      throw new Error('SMTP transporter not configured');
    }
    const info = await this.transporter.sendMail({
      from: {
        name: 'YDesk',
        address: process.env.SMTP_FROM
      },
      to,
      subject,
      html,
      text
    });
    return { success: true, provider: 'SMTP', messageId: info.messageId };
  }
}

export default new EmailService();

