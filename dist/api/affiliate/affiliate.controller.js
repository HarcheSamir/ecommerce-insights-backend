"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAffiliateDashboard = void 0;
const index_1 = require("../../index");
/**
 * @description Fetches all necessary data for the user's affiliate dashboard.
 * @route GET /api/affiliate/dashboard
 */
const getAffiliateDashboard = async (req, res) => {
    try {
        const userId = req.user.userId;
        // Step 1: Check if the user is eligible to be an affiliate (i.e., has made a payment)
        const hasPaid = await index_1.prisma.transaction.findFirst({
            where: {
                userId: userId,
                status: 'succeeded'
            }
        });
        if (!hasPaid) {
            return res.status(403).json({
                message: 'Affiliate features are unlocked after your first successful payment.'
            });
        }
        // Step 2: Fetch all affiliate data in a single query
        const userData = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                // For the list of referred users
                referrals: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        createdAt: true,
                        // Include their transactions to check for payment status
                        transactions: {
                            where: { status: 'succeeded' },
                            select: { id: true }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                // For calculating earnings
                commissionsEarned: {
                    select: {
                        amount: true
                    },
                    // Only count commissions that haven't been paid out
                    where: {
                        payoutRequest: null // Or more complex logic if needed
                    }
                }
            }
        });
        if (!userData) {
            return res.status(404).json({ error: 'User not found.' });
        }
        // Step 3: Format the data for the frontend
        const referralLink = `https://influencecontact.com/signup?ref=${userId}`;
        const totalUnpaidCommissions = userData.commissionsEarned.reduce((sum, c) => sum + c.amount, 0);
        const referredUsersList = userData.referrals.map(ref => ({
            id: ref.id,
            name: `${ref.firstName} ${ref.lastName}`,
            signedUpAt: ref.createdAt,
            hasPaid: ref.transactions.length > 0 // True if they have at least one successful transaction
        }));
        const paidReferralsCount = referredUsersList.filter(u => u.hasPaid).length;
        // Step 4: Send the complete dashboard data
        res.status(200).json({
            referralLink,
            stats: {
                totalReferrals: referredUsersList.length,
                paidReferrals: paidReferralsCount,
                totalUnpaidCommissions: totalUnpaidCommissions,
            },
            referredUsers: referredUsersList
        });
    }
    catch (error) {
        console.error('Error fetching affiliate dashboard:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
exports.getAffiliateDashboard = getAffiliateDashboard;
