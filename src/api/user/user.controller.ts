import { Request, Response } from 'express';
import { prisma } from './../../index';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import Stripe from "stripe"; // --- MODIFICATION START ---

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// The existing getUserProfile function...
export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;

    // Fetch paid transaction count
    const paidTransaction = await prisma.transaction.count({
      where: {
        userId: userId,
        status: 'succeeded',
      },
    });

    // Fetch user profile with search history and visited profiles
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        accountType: true,
        createdAt: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        coursePurchases: { select: { courseId: true } },
        searchHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Limit to last 10 searches
          select: {
            id: true,
            keyword: true,
            country: true,
            createdAt: true,
          },
        },
        visitedProfiles: {
          orderBy: { visitedAt: 'desc' },
          take: 5, // Limit to last 5 visited profiles
          select: {
            visitedAt: true,
            creator: {
              select: {
                id: true,
                nickname: true,
                username: true,
                profileLink: true,
                instagram: true,
                country: true,
                region: true,
                youtube: true,
                followers: true,
              },
            },
          },
        },
      },
    });

    if (!userProfile) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let isCancellationScheduled = false;
    if (userProfile.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(userProfile.stripeSubscriptionId);
        isCancellationScheduled = subscription.cancel_at_period_end;
      } catch (stripeError) {
        console.error("Could not fetch subscription from Stripe:", stripeError);
        // Do not block the request if Stripe fails; proceed with DB data.
      }
    }

    // Calculate total search count
    const totalSearchCount = await prisma.searchHistory.count({
      where: { userId: userId },
    });

    // Initialize response data
    let responseData: any = {
      ...userProfile,
      isCancellationScheduled,
      hasPaid: userProfile.subscriptionStatus === 'ACTIVE' || userProfile.subscriptionStatus === 'TRIALING',
      totalSearchCount,
      visitedProfiles: userProfile.visitedProfiles,
      totalVisitsCount: userProfile.visitedProfiles.length,
    };

    // If no visited profiles, fetch 5 random content creators
    if (userProfile.visitedProfiles.length === 0) {
      const randomCreators = await prisma.contentCreator.findMany({
        take: 5,
        orderBy: {
          id: 'asc', // Using a random seed or true randomization requires DB-specific functions
        },
        select: {
          id: true,
          nickname: true,
          username: true,
          profileLink: true,
          instagram: true,
          country: true,
          region: true,
          youtube: true,
        },
      });

      responseData.visitedProfiles = randomCreators.map((creator) => ({
        creator, // Map to match the structure of visitedProfiles
        visitedAt: null, // No visit timestamp for random creators
      }));
      responseData.totalVisitsCount = 0;
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};


/**
 * @description Updates the authenticated user's password after verifying their current one.
 * @route PATCH /api/profile/update-password
 */
export const updatePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Check for authenticated user
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;

    // 2. Input Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both currentPassword and newPassword are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    // 3. Fetch the user with their current password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // 4. Verify the current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      // Use a generic error message for security
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 5. Hash the new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // 6. Update the user's password in the database
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
      },
    });

    return res.status(200).json({ message: 'Password updated successfully.' });

  } catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Fetches the most recent notifications for the authenticated user.
 * @route GET /api/profile/notifications
 */
export const getUserNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 7, // Fetch the 7 most recent notifications
    });

    return res.status(200).json(notifications);

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

export const updateUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Check for authenticated user
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;
    const { firstName, lastName } = req.body;

    // 2. Input Validation
    if (!firstName || !lastName || firstName.trim() === '' || lastName.trim() === '') {
      return res.status(400).json({ error: 'First name and last name are required.' });
    }

    // 3. Update the user's profile in the database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
      // Select the fields to return, excluding the password
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        accountType: true,
        createdAt: true,
      }
    });

    return res.status(200).json(updatedUser);

  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};