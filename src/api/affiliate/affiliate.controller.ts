// In ./src/api/affiliate/affiliate.controller.ts

import { Response } from 'express';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { prisma } from '../../index';

export const getAffiliateDashboard = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        // --- THIS IS THE SECOND PART OF THE FIX ---
        // Reverted to the original, correct logic. It checks if ANY successful payment exists.
        const transactionCount = await prisma.transaction.count({
            where: {
                userId: userId,
                status: 'succeeded'
            }
        });

        if (transactionCount === 0) {
            return res.status(403).json({
                message: 'Affiliate features are unlocked after your first successful payment.'
            });
        }
        // --- END OF FIX PART 2 ---

        const userData = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                referrals: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        createdAt: true,
                        transactions: {
                            where: { status: 'succeeded' },
                            select: { id: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                },
                commissionsEarned: {
                    select: { amount: true },
                    where: { payoutRequest: null }
                }
            }
        });

        if (!userData) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const referralLink = `${userId}`;
        const totalUnpaidCommissions = userData.commissionsEarned.reduce((sum, c) => sum + c.amount, 0);
        const referredUsersList = userData.referrals.map(ref => ({
            id: ref.id,
            name: `${ref.firstName} ${ref.lastName}`,
            signedUpAt: ref.createdAt,
            hasPaid: ref.transactions.length > 0
        }));
        const paidReferralsCount = referredUsersList.filter(u => u.hasPaid).length;

        res.status(200).json({
            referralLink,
            stats: {
                totalReferrals: referredUsersList.length,
                paidReferrals: paidReferralsCount,
                totalUnpaidCommissions: totalUnpaidCommissions,
            },
            referredUsers: referredUsersList
        });

    } catch (error) {
        console.error('Error fetching affiliate dashboard:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};