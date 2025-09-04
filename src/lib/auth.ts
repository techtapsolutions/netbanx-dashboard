import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './database';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId?: string;
  company?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_USER' | 'READONLY';
  companyId?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SessionInfo {
  token: string;
  user: AuthUser;
  expiresAt: Date;
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';
  private static readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly PASSWORD_RESET_DURATION = 60 * 60 * 1000; // 1 hour

  // Hash password
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  // Verify password
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Create user
  static async createUser(userData: CreateUserData, createdById?: string): Promise<AuthUser> {
    try {
      // Check if user already exists
      const existingUser = await db.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await this.hashPassword(userData.password);

      // Create user
      const user = await db.user.create({
        data: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          passwordHash,
          role: userData.role,
          companyId: userData.companyId,
        },
        include: {
          company: true,
        },
      });

      // Log audit event
      if (createdById) {
        await this.logAuditEvent({
          action: 'CREATE',
          resource: 'USER',
          resourceId: user.id,
          userId: createdById,
          details: { email: userData.email, role: userData.role },
        });
      }

      return this.mapUserToAuthUser(user);
    } catch (error) {
      console.error('Create user failed:', error);
      throw error;
    }
  }

  // Login user
  static async login(credentials: LoginCredentials, ipAddress?: string, userAgent?: string): Promise<SessionInfo> {
    try {
      // Find user
      const user = await db.user.findUnique({
        where: { email: credentials.email },
        include: { company: true },
      });

      if (!user || !user.isActive) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValid = await this.verifyPassword(credentials.password, user.passwordHash);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Update last login
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Create session
      const token = this.generateSessionToken();
      const expiresAt = new Date(Date.now() + this.SESSION_DURATION);

      await db.session.create({
        data: {
          token,
          userId: user.id,
          expiresAt,
          ipAddress,
          userAgent,
        },
      });

      // Log audit event
      await this.logAuditEvent({
        action: 'LOGIN',
        userId: user.id,
        companyId: user.companyId,
        ipAddress,
        userAgent,
      });

      return {
        token,
        user: this.mapUserToAuthUser(user),
        expiresAt,
      };
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  // Verify session token
  static async verifySession(token: string): Promise<AuthUser | null> {
    try {
      const session = await db.session.findUnique({
        where: { token },
        include: {
          user: {
            include: { company: true },
          },
        },
      });

      if (!session || session.expiresAt < new Date() || !session.user.isActive) {
        return null;
      }

      return this.mapUserToAuthUser(session.user);
    } catch (error) {
      console.error('Session verification failed:', error);
      return null;
    }
  }

  // Logout user
  static async logout(token: string): Promise<void> {
    try {
      const session = await db.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (session) {
        await db.session.delete({
          where: { token },
        });

        // Log audit event
        await this.logAuditEvent({
          action: 'LOGOUT',
          userId: session.userId,
          companyId: session.user.companyId,
        });
      }
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  // Get all users (admin only)
  static async getUsers(requestingUserId: string, companyId?: string) {
    try {
      const requestingUser = await db.user.findUnique({
        where: { id: requestingUserId },
      });

      if (!requestingUser) {
        throw new Error('User not found');
      }

      const whereClause: any = {};
      
      // Super admins can see all users
      if (requestingUser.role === 'SUPER_ADMIN') {
        if (companyId) {
          whereClause.companyId = companyId;
        }
      } else {
        // Company admins can only see users in their company
        whereClause.companyId = requestingUser.companyId;
      }

      const users = await db.user.findMany({
        where: whereClause,
        include: { company: true },
        orderBy: { createdAt: 'desc' },
      });

      return users.map(this.mapUserToAuthUser);
    } catch (error) {
      console.error('Get users failed:', error);
      throw error;
    }
  }

  // Update user
  static async updateUser(
    userId: string, 
    updates: Partial<CreateUserData>, 
    updatedById: string
  ): Promise<AuthUser> {
    try {
      const data: any = {};
      
      if (updates.email) data.email = updates.email;
      if (updates.firstName) data.firstName = updates.firstName;
      if (updates.lastName) data.lastName = updates.lastName;
      if (updates.role) data.role = updates.role;
      if (updates.companyId !== undefined) data.companyId = updates.companyId;
      if (updates.password) {
        data.passwordHash = await this.hashPassword(updates.password);
      }

      const user = await db.user.update({
        where: { id: userId },
        data,
        include: { company: true },
      });

      // Log audit event
      await this.logAuditEvent({
        action: 'UPDATE',
        resource: 'USER',
        resourceId: userId,
        userId: updatedById,
        details: updates,
      });

      return this.mapUserToAuthUser(user);
    } catch (error) {
      console.error('Update user failed:', error);
      throw error;
    }
  }

  // Delete user
  static async deleteUser(userId: string, deletedById: string): Promise<void> {
    try {
      await db.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      // Delete all sessions
      await db.session.deleteMany({
        where: { userId },
      });

      // Log audit event
      await this.logAuditEvent({
        action: 'DELETE',
        resource: 'USER',
        resourceId: userId,
        userId: deletedById,
      });
    } catch (error) {
      console.error('Delete user failed:', error);
      throw error;
    }
  }

  // Generate password reset token
  static async generatePasswordResetToken(email: string): Promise<string> {
    try {
      const user = await db.user.findUnique({
        where: { email },
      });

      if (!user || !user.isActive) {
        throw new Error('User not found');
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenAt = new Date(Date.now() + this.PASSWORD_RESET_DURATION);

      await db.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenAt,
        },
      });

      return resetToken;
    } catch (error) {
      console.error('Generate reset token failed:', error);
      throw error;
    }
  }

  // Reset password
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const user = await db.user.findFirst({
        where: {
          resetToken: token,
          resetTokenAt: { gt: new Date() },
          isActive: true,
        },
      });

      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      const passwordHash = await this.hashPassword(newPassword);

      await db.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenAt: null,
        },
      });

      // Delete all existing sessions
      await db.session.deleteMany({
        where: { userId: user.id },
      });

      // Log audit event
      await this.logAuditEvent({
        action: 'PASSWORD_RESET',
        userId: user.id,
        companyId: user.companyId,
      });
    } catch (error) {
      console.error('Reset password failed:', error);
      throw error;
    }
  }

  // Check permissions
  static hasPermission(user: AuthUser, permission: string, companyId?: string): boolean {
    // Super admin has all permissions
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // Company-specific permissions
    if (companyId && user.companyId !== companyId) {
      return false;
    }

    switch (permission) {
      case 'read:transactions':
      case 'read:webhooks':
      case 'read:analytics':
      case 'read:accounts':
        return ['COMPANY_ADMIN', 'COMPANY_USER', 'READONLY'].includes(user.role);
      
      case 'write:webhooks':
      case 'manage:notifications':
      case 'manage:api-tokens':
        return ['COMPANY_ADMIN'].includes(user.role);
      
      case 'manage:users':
      case 'manage:company':
        return ['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.role);
      
      case 'manage:all-companies':
        return user.role === 'SUPER_ADMIN';
      
      default:
        return false;
    }
  }

  // Generate session token
  private static generateSessionToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  // Map database user to auth user
  private static mapUserToAuthUser(user: any): AuthUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId,
      company: user.company ? {
        id: user.company.id,
        name: user.company.name,
        email: user.company.email,
      } : undefined,
    };
  }

  // Log audit event
  private static async logAuditEvent(event: {
    action: string;
    resource?: string;
    resourceId?: string;
    userId?: string;
    companyId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: any;
  }): Promise<void> {
    try {
      await db.auditLog.create({
        data: {
          action: event.action,
          resource: event.resource,
          resourceId: event.resourceId,
          userId: event.userId,
          companyId: event.companyId,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          details: event.details,
        },
      });
    } catch (error) {
      console.error('Audit log failed:', error);
    }
  }
}

// Middleware to check authentication
export function requireAuth(requiredPermission?: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await AuthService.verifySession(token);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Check permission if required
      if (requiredPermission && !AuthService.hasPermission(user, requiredPermission)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
}