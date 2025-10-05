import { NextFunction,Request,Response } from "express";
import { prisma } from "..";
import { AuthenticatedRequest } from "../utils/AuthRequestType";


export const hasMembershipMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    
     if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }
    
    const { userId } = req.user;
    
    const count = await prisma.transaction.count({
        where: { userId: userId , status: 'succeeded' },
     });
    
    if (count == 0) {
        return res.status(403).json({ message: 'Forbidden. Membership required.' });
    }
    
    next();
};