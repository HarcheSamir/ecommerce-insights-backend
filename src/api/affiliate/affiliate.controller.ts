import { Response } from 'express';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { prisma } from '../../index';
import { PayoutStatus } from '@prisma/client';

export const getAffiliateDashboard = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const transactionCount = await prisma.transaction.count({
            where: { userId: userId, status: 'succeeded' }
        });

        if (transactionCount === 0) {
            return res.status(403).json({ message: 'Affiliate features are unlocked after your first successful payment.' });
        }

        const [userData, minimumPayoutThresholdSetting, commissionRateSetting] = await Promise.all([
            prisma.user.findUnique({
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
                                select: {
                                    id: true,
                                    generatedCommission: {
                                        select: {
                                            amount: true,
                                            sourceTransaction: { select: { currency: true } }
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    },
                    commissionsEarned: {
                        select: { amount: true },
                        where: { payoutRequest: null }
                    },
                    payoutRequests: {
                        orderBy: { requestedAt: 'desc' },
                        take: 10
                    }
                }
            }),
            prisma.setting.findUnique({ where: { key: 'minimumPayoutThreshold' } }),
            prisma.setting.findUnique({ where: { key: 'affiliateCommissionRate' } })
        ]);

        if (!userData) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const minimumPayoutThreshold = Number(minimumPayoutThresholdSetting?.value) || 100;
        const commissionRate = Number(commissionRateSetting?.value) || 20;
        const referralLink = `${userId}`;
        
        // ==================== SURGICAL MODIFICATION START ====================
        const totalUnpaidCommissionsUsd = userData.commissionsEarned.reduce((sum, commission) => sum + commission.amount, 0);

        const referredUsersList = userData.referrals.map(ref => {
            const firstCommissionDetails = ref.transactions.find(t => t.generatedCommission)?.generatedCommission;
            return {
                id: ref.id,
                name: `${ref.firstName} ${ref.lastName}`,
                signedUpAt: ref.createdAt,
                hasPaid: ref.transactions.length > 0,
                commissionEarned: firstCommissionDetails ? firstCommissionDetails.amount : null,
                commissionCurrency: firstCommissionDetails ? firstCommissionDetails.sourceTransaction.currency : null,
            };
        });
        // ===================== SURGICAL MODIFICATION END =====================

        const paidReferralsCount = referredUsersList.filter(u => u.hasPaid).length;

        res.status(200).json({
            referralLink,
            minimumPayoutThreshold,
            commissionRate,
            stats: {
                totalReferrals: referredUsersList.length,
                paidReferrals: paidReferralsCount,
                totalUnpaidCommissionsUsd: totalUnpaidCommissionsUsd, // <-- Use the new summed value
            },
            referredUsers: referredUsersList, // This now includes currency
            payoutRequests: userData.payoutRequests
        });
    } catch (error) {
        console.error('Error fetching affiliate dashboard:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

export const requestPayout = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const [unpaidCommissions, minimumPayoutSetting, pendingRequest] = await Promise.all([
            prisma.commission.findMany({ where: { affiliateId: userId, payoutRequestId: null } }),
            prisma.setting.findUnique({ where: { key: 'minimumPayoutThreshold' } }),
            prisma.payoutRequest.findFirst({ where: { affiliateId: userId, status: 'PENDING' } })
        ]);

        if (pendingRequest) {
            return res.status(400).json({ message: 'You already have a pending payout request.' });
        }

        // ==================== SURGICAL MODIFICATION START ====================
        const totalUnpaidAmount = unpaidCommissions.reduce((sum, c) => sum + c.amount, 0);
        // ===================== SURGICAL MODIFICATION END =====================
        
        const minimumThreshold = Number(minimumPayoutSetting?.value) || 100;

        if (totalUnpaidAmount < minimumThreshold) {
            return res.status(400).json({ message: `You must have at least €${minimumThreshold} in unpaid commissions to request a payout.` });
        }
        if (unpaidCommissions.length === 0) {
            return res.status(400).json({ message: 'No unpaid commissions available.' });
        }

        const newPayoutRequest = await prisma.$transaction(async (tx) => {
            const payout = await tx.payoutRequest.create({
                data: {
                    affiliateId: userId,
                    amount: totalUnpaidAmount,
                    currency: 'usd', // <-- Hardcode the payout currency to USD
                    status: PayoutStatus.PENDING
                }
            });
            await tx.commission.updateMany({
                where: { id: { in: unpaidCommissions.map(c => c.id) } },
                data: { payoutRequestId: payout.id }
            });
            return payout;
        });

        res.status(201).json(newPayoutRequest);
    } catch (error) {
        console.error('Error requesting payout:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};