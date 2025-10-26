import { Request, Response } from 'express';
import { prisma } from '../../index';
import { PayoutStatus } from '@prisma/client';

/**
 * @description Fetches the top 5 affiliates based on total commission earned.
 * @route GET /api/admin/affiliates/leaderboard
 */
export const getAffiliateLeaderboard = async (req: Request, res: Response) => {
    try {
        const affiliates = await prisma.user.findMany({
            where: {
                // Ensure we only consider users who have actually earned something
                commissionsEarned: {
                    some: {} 
                }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                referrals: {
                    select: { id: true } // Select a minimal field for counting
                },
                commissionsEarned: {
                    select: { amount: true }
                }
            }
        });

        const leaderboard = affiliates.map(affiliate => {
            const totalCommission = affiliate.commissionsEarned.reduce((sum, commission) => sum + commission.amount, 0);
            return {
                id: affiliate.id,
                name: `${affiliate.firstName} ${affiliate.lastName}`,
                email: affiliate.email,
                totalCommission: totalCommission,
                subscribers: affiliate.referrals.length,
            };
        })
        .sort((a, b) => b.totalCommission - a.totalCommission) // Sort descending by commission
        .slice(0, 5); // Take the top 5

        res.status(200).json(leaderboard);

    } catch (error) {
        console.error('Error fetching affiliate leaderboard:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

/**
 * @description Fetches payout requests, filterable by status.
 * @route GET /api/admin/payouts
 * @queryparam status {string} - PENDING, APPROVED, REJECTED, PAID
 */
export const getPayoutRequests = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;

        // Validate status query parameter
        const where = {
            status: Object.values(PayoutStatus).includes(status as PayoutStatus) 
                ? (status as PayoutStatus)
                : PayoutStatus.PENDING // Default to PENDING
        };

        const payoutRequests = await prisma.payoutRequest.findMany({
            where,
            include: {
                affiliate: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        _count: {
                            select: { referrals: true }
                        }
                    }
                }
            },
            orderBy: {
                requestedAt: 'asc'
            }
        });

        // Remap to match the UI screenshot's data structure
        const formattedRequests = payoutRequests.map(pr => ({
            id: pr.id,
            status: pr.status,
            amount: pr.amount,
            requestedAt: pr.requestedAt,
            affiliate: {
                name: `${pr.affiliate.firstName} ${pr.affiliate.lastName}`,
                email: pr.affiliate.email,
                subscribers: pr.affiliate._count.referrals
            }
        }));

        res.status(200).json(formattedRequests);

    } catch (error) {
        console.error('Error fetching payout requests:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

/**
 * @description Updates the status of a payout request (e.g., to APPROVE or REJECT).
 * @route PATCH /api/admin/payouts/:payoutId/status
 */
export const updatePayoutStatus = async (req: Request, res: Response) => {
    try {
        const { payoutId } = req.params;
        const { status } = req.body as { status: PayoutStatus };

        // Validate the provided status
        if (!Object.values(PayoutStatus).includes(status)) {
            return res.status(400).json({ error: 'Invalid status provided.' });
        }

        const updatedPayoutRequest = await prisma.payoutRequest.update({
            where: { id: payoutId },
            data: {
                status: status,
                processedAt: new Date()
            }
        });

        res.status(200).json(updatedPayoutRequest);

    } catch (error) {
        console.error('Error updating payout status:', error);
        // Handle cases where the payout request doesn't exist
        if ((error as any).code === 'P2025') {
            return res.status(404).json({ error: 'Payout request not found.' });
        }
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};