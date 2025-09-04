import nodemailer from 'nodemailer';
import { db } from './database';
import { formatCurrency, formatDateTime } from './utils';

export interface EmailConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationContext {
  companyId: string;
  eventType: string;
  data?: any;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }

  // Send email with logging
  async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string,
    context?: NotificationContext
  ): Promise<void> {
    try {
      const toArray = Array.isArray(to) ? to : [to];
      
      // Create email log entry
      const emailLog = await db.emailLog.create({
        data: {
          to: toArray,
          subject,
          content: html,
          status: 'PENDING',
          companyId: context?.companyId,
          eventType: context?.eventType,
          metadata: context?.data,
        },
      });

      // Send email
      const result = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: toArray.join(', '),
        subject,
        html,
        text: text || this.htmlToText(html),
      });

      // Update email log
      await db.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      console.log('Email sent successfully:', {
        to: toArray,
        subject,
        messageId: result.messageId,
      });

    } catch (error) {
      console.error('Email send failed:', error);
      
      // Update email log with error
      try {
        await db.emailLog.updateMany({
          where: {
            to: { hasSome: Array.isArray(to) ? to : [to] },
            subject,
            status: 'PENDING',
          },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch (logError) {
        console.error('Failed to update email log:', logError);
      }

      throw error;
    }
  }

  // Send webhook failure notification
  async sendWebhookFailureNotification(companyId: string, webhookEvent: any): Promise<void> {
    try {
      const settings = await this.getNotificationSettings(companyId);
      
      if (!settings?.emailEnabled || !settings?.notifyOnFailure || !settings.emailAddresses.length) {
        return;
      }

      const company = await db.company.findUnique({
        where: { id: companyId },
      });

      const template = this.getWebhookFailureTemplate(company?.name || 'Your Company', webhookEvent);
      
      await this.sendEmail(
        settings.emailAddresses,
        template.subject,
        template.html,
        template.text,
        { companyId, eventType: 'WEBHOOK_FAILURE', data: webhookEvent }
      );

    } catch (error) {
      console.error('Failed to send webhook failure notification:', error);
    }
  }

  // Send high volume alert
  async sendHighVolumeAlert(companyId: string, stats: any): Promise<void> {
    try {
      const settings = await this.getNotificationSettings(companyId);
      
      if (!settings?.emailEnabled || !settings?.notifyOnHighVolume || !settings.emailAddresses.length) {
        return;
      }

      if (stats.webhooksPerHour < settings.highVolumeThreshold) {
        return;
      }

      const company = await db.company.findUnique({
        where: { id: companyId },
      });

      const template = this.getHighVolumeTemplate(company?.name || 'Your Company', stats, settings.highVolumeThreshold);
      
      await this.sendEmail(
        settings.emailAddresses,
        template.subject,
        template.html,
        template.text,
        { companyId, eventType: 'HIGH_VOLUME_ALERT', data: stats }
      );

    } catch (error) {
      console.error('Failed to send high volume alert:', error);
    }
  }

  // Send error rate alert
  async sendErrorRateAlert(companyId: string, errorRate: number, period: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings(companyId);
      
      if (!settings?.emailEnabled || !settings?.notifyOnErrors || !settings.emailAddresses.length) {
        return;
      }

      if (errorRate < settings.errorRateThreshold) {
        return;
      }

      const company = await db.company.findUnique({
        where: { id: companyId },
      });

      const template = this.getErrorRateTemplate(company?.name || 'Your Company', errorRate, period, settings.errorRateThreshold);
      
      await this.sendEmail(
        settings.emailAddresses,
        template.subject,
        template.html,
        template.text,
        { companyId, eventType: 'ERROR_RATE_ALERT', data: { errorRate, period } }
      );

    } catch (error) {
      console.error('Failed to send error rate alert:', error);
    }
  }

  // Send daily summary
  async sendDailySummary(companyId: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings(companyId);
      
      if (!settings?.emailEnabled || !settings?.dailySummary || !settings.emailAddresses.length) {
        return;
      }

      // Get daily stats
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date(yesterday);
      today.setDate(today.getDate() + 1);

      const [transactions, webhookEvents] = await Promise.all([
        db.transaction.findMany({
          where: {
            companyId,
            createdAt: { gte: yesterday, lt: today },
          },
        }),
        db.webhookEvent.findMany({
          where: {
            companyId,
            timestamp: { gte: yesterday, lt: today },
          },
        }),
      ]);

      const company = await db.company.findUnique({
        where: { id: companyId },
      });

      const summary = this.calculateDailySummary(transactions, webhookEvents);
      const template = this.getDailySummaryTemplate(company?.name || 'Your Company', summary, yesterday);
      
      await this.sendEmail(
        settings.emailAddresses,
        template.subject,
        template.html,
        template.text,
        { companyId, eventType: 'DAILY_SUMMARY', data: summary }
      );

    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  // Send welcome email for new users
  async sendWelcomeEmail(user: any, company: any, temporaryPassword?: string): Promise<void> {
    try {
      const template = this.getWelcomeTemplate(user, company, temporaryPassword);
      
      await this.sendEmail(
        user.email,
        template.subject,
        template.html,
        template.text,
        { companyId: company?.id, eventType: 'USER_WELCOME', data: { userId: user.id } }
      );

    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(user: any, resetToken: string): Promise<void> {
    try {
      const template = this.getPasswordResetTemplate(user, resetToken);
      
      await this.sendEmail(
        user.email,
        template.subject,
        template.html,
        template.text,
        { companyId: user.companyId, eventType: 'PASSWORD_RESET', data: { userId: user.id } }
      );

    } catch (error) {
      console.error('Failed to send password reset email:', error);
    }
  }

  // Get notification settings for a company
  private async getNotificationSettings(companyId: string) {
    return await db.notificationSetting.findUnique({
      where: { companyId },
    });
  }

  // Calculate daily summary statistics
  private calculateDailySummary(transactions: any[], webhookEvents: any[]) {
    return {
      transactions: {
        total: transactions.length,
        completed: transactions.filter(t => t.status === 'COMPLETED').length,
        failed: transactions.filter(t => t.status === 'FAILED').length,
        pending: transactions.filter(t => t.status === 'PENDING').length,
        totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
        currency: transactions[0]?.currency || 'USD',
      },
      webhooks: {
        total: webhookEvents.length,
        processed: webhookEvents.filter(e => e.processed && !e.error).length,
        failed: webhookEvents.filter(e => e.error).length,
      },
    };
  }

  // Convert HTML to text
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Email templates
  private getWebhookFailureTemplate(companyName: string, webhookEvent: any): EmailTemplate {
    const subject = `🚨 Webhook Processing Failed - ${companyName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .alert { background: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 4px; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Webhook Processing Failed</h1>
          </div>
          <div class="content">
            <div class="alert">
              <strong>Alert:</strong> A webhook event failed to process for ${companyName}.
            </div>
            
            <h3>Event Details:</h3>
            <ul>
              <li><strong>Event Type:</strong> ${webhookEvent.eventType}</li>
              <li><strong>Event ID:</strong> ${webhookEvent.id}</li>
              <li><strong>Timestamp:</strong> ${formatDateTime(webhookEvent.timestamp)}</li>
              <li><strong>Error:</strong> ${webhookEvent.error || 'Processing failed'}</li>
            </ul>
            
            <p>Please check your webhook dashboard for more details and take appropriate action.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from Netbanx Dashboard</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      🚨 WEBHOOK PROCESSING FAILED
      
      A webhook event failed to process for ${companyName}.
      
      Event Details:
      - Event Type: ${webhookEvent.eventType}
      - Event ID: ${webhookEvent.id}
      - Timestamp: ${formatDateTime(webhookEvent.timestamp)}
      - Error: ${webhookEvent.error || 'Processing failed'}
      
      Please check your webhook dashboard for more details.
    `;

    return { subject, html, text };
  }

  private getHighVolumeTemplate(companyName: string, stats: any, threshold: number): EmailTemplate {
    const subject = `📈 High Volume Alert - ${companyName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ffc107; color: #212529; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .stats { background: #fff3cd; border: 1px solid #ffecb5; padding: 15px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📈 High Volume Alert</h1>
          </div>
          <div class="content">
            <p>High webhook volume detected for ${companyName}.</p>
            
            <div class="stats">
              <h3>Current Stats:</h3>
              <ul>
                <li><strong>Webhooks per Hour:</strong> ${stats.webhooksPerHour}</li>
                <li><strong>Threshold:</strong> ${threshold}</li>
                <li><strong>Total Today:</strong> ${stats.totalToday}</li>
              </ul>
            </div>
            
            <p>Your system is experiencing higher than normal webhook volume. Please monitor your processing capacity.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      📈 HIGH VOLUME ALERT
      
      High webhook volume detected for ${companyName}.
      
      Current Stats:
      - Webhooks per Hour: ${stats.webhooksPerHour}
      - Threshold: ${threshold}
      - Total Today: ${stats.totalToday}
      
      Please monitor your processing capacity.
    `;

    return { subject, html, text };
  }

  private getErrorRateTemplate(companyName: string, errorRate: number, period: string, threshold: number): EmailTemplate {
    const subject = `⚠️ High Error Rate Alert - ${companyName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ High Error Rate Alert</h1>
          </div>
          <div class="content">
            <div class="error">
              <p>High error rate detected for ${companyName} in the last ${period}.</p>
              
              <h3>Error Details:</h3>
              <ul>
                <li><strong>Current Error Rate:</strong> ${errorRate.toFixed(1)}%</li>
                <li><strong>Threshold:</strong> ${threshold}%</li>
                <li><strong>Period:</strong> ${period}</li>
              </ul>
            </div>
            
            <p>Please investigate the cause of these errors and take corrective action.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      ⚠️ HIGH ERROR RATE ALERT
      
      High error rate detected for ${companyName} in the last ${period}.
      
      Error Details:
      - Current Error Rate: ${errorRate.toFixed(1)}%
      - Threshold: ${threshold}%
      - Period: ${period}
      
      Please investigate and take corrective action.
    `;

    return { subject, html, text };
  }

  private getDailySummaryTemplate(companyName: string, summary: any, date: Date): EmailTemplate {
    const subject = `📊 Daily Summary - ${companyName} - ${date.toDateString()}`;
    const successRate = summary.transactions.total > 0 
      ? (summary.transactions.completed / summary.transactions.total * 100).toFixed(1)
      : '0';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .summary { background: white; border: 1px solid #dee2e6; padding: 15px; border-radius: 4px; margin: 10px 0; }
          .metric { display: inline-block; margin: 10px 15px 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Daily Summary</h1>
            <p>${companyName} - ${date.toDateString()}</p>
          </div>
          <div class="content">
            <div class="summary">
              <h3>🔄 Transactions</h3>
              <div class="metric"><strong>Total:</strong> ${summary.transactions.total}</div>
              <div class="metric"><strong>Completed:</strong> ${summary.transactions.completed}</div>
              <div class="metric"><strong>Failed:</strong> ${summary.transactions.failed}</div>
              <div class="metric"><strong>Success Rate:</strong> ${successRate}%</div>
              <div class="metric"><strong>Total Amount:</strong> ${formatCurrency(summary.transactions.totalAmount, summary.transactions.currency)}</div>
            </div>
            
            <div class="summary">
              <h3>🔗 Webhooks</h3>
              <div class="metric"><strong>Total:</strong> ${summary.webhooks.total}</div>
              <div class="metric"><strong>Processed:</strong> ${summary.webhooks.processed}</div>
              <div class="metric"><strong>Failed:</strong> ${summary.webhooks.failed}</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      📊 DAILY SUMMARY - ${companyName} - ${date.toDateString()}
      
      🔄 Transactions:
      - Total: ${summary.transactions.total}
      - Completed: ${summary.transactions.completed}
      - Failed: ${summary.transactions.failed}
      - Success Rate: ${successRate}%
      - Total Amount: ${formatCurrency(summary.transactions.totalAmount, summary.transactions.currency)}
      
      🔗 Webhooks:
      - Total: ${summary.webhooks.total}
      - Processed: ${summary.webhooks.processed}
      - Failed: ${summary.webhooks.failed}
    `;

    return { subject, html, text };
  }

  private getWelcomeTemplate(user: any, company: any, temporaryPassword?: string): EmailTemplate {
    const subject = `Welcome to Netbanx Dashboard - ${company?.name || 'Your Account'}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .credentials { background: #fff3cd; border: 1px solid #ffecb5; padding: 15px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Netbanx Dashboard</h1>
          </div>
          <div class="content">
            <p>Hello ${user.firstName} ${user.lastName},</p>
            
            <p>Welcome to the Netbanx Dashboard! Your account has been created for ${company?.name || 'your organization'}.</p>
            
            ${temporaryPassword ? `
              <div class="credentials">
                <h3>Your Login Credentials:</h3>
                <ul>
                  <li><strong>Email:</strong> ${user.email}</li>
                  <li><strong>Temporary Password:</strong> ${temporaryPassword}</li>
                </ul>
                <p><strong>Important:</strong> Please change your password after your first login.</p>
              </div>
            ` : ''}
            
            <p>You can access the dashboard at: <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3001'}">${process.env.NEXTAUTH_URL || 'http://localhost:3001'}</a></p>
            
            <p>If you have any questions, please contact your system administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      🎉 WELCOME TO NETBANX DASHBOARD
      
      Hello ${user.firstName} ${user.lastName},
      
      Welcome to the Netbanx Dashboard! Your account has been created for ${company?.name || 'your organization'}.
      
      ${temporaryPassword ? `
      Your Login Credentials:
      - Email: ${user.email}
      - Temporary Password: ${temporaryPassword}
      
      Important: Please change your password after your first login.
      ` : ''}
      
      You can access the dashboard at: ${process.env.NEXTAUTH_URL || 'http://localhost:3001'}
      
      If you have any questions, please contact your system administrator.
    `;

    return { subject, html, text };
  }

  private getPasswordResetTemplate(user: any, resetToken: string): EmailTemplate {
    const subject = 'Password Reset Request - Netbanx Dashboard';
    const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ffc107; color: #212529; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 20px; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello ${user.firstName} ${user.lastName},</p>
            
            <p>You requested a password reset for your Netbanx Dashboard account.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <p><a href="${resetUrl}" class="button">Reset Password</a></p>
            
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            
            <p><strong>This link will expire in 1 hour.</strong></p>
            
            <p>If you didn't request this password reset, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      🔐 PASSWORD RESET REQUEST
      
      Hello ${user.firstName} ${user.lastName},
      
      You requested a password reset for your Netbanx Dashboard account.
      
      Use this link to reset your password:
      ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request this password reset, please ignore this email.
    `;

    return { subject, html, text };
  }
}