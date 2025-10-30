import { Request, Response } from 'express';
import { prisma } from '../../index';
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


// --- Dashboard Stats Controller ---
export const getAdminDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      activeSubscribers,
      totalUsers,
      totalRevenue,
      totalVideos,
      totalCourses,
      totalInfluencers,
      totalProducts,
    ] = await prisma.$transaction([
      prisma.transaction.count({ where: { status: 'succeeded' } }),
      prisma.user.count(),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: 'succeeded' } }),
      prisma.video.count(),
      prisma.videoCourse.count(),
      prisma.contentCreator.count(),
      prisma.winningProduct.count(),
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyRevenueData = await prisma.transaction.groupBy({
      by: ['createdAt'],
      where: { status: 'succeeded', createdAt: { gte: sixMonthsAgo } },
      _sum: { amount: true },
      orderBy: { createdAt: 'asc' }
    });
    
    const monthlyRevenueChart = monthlyRevenueData.reduce((acc: { [key: string]: number }, item) => {
        const month = new Date(item.createdAt).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
        if (!acc[month]) acc[month] = 0;
        acc[month] += item._sum.amount || 0;
        return acc;
    }, {});

    res.status(200).json({
      activeSubscribers,
      totalUsers,
      monthlyRevenue: totalRevenue._sum.amount || 0,
      totalVideos,
      totalCourses,
      totalInfluencers,
      totalProducts,
      monthlyRevenueChart,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

// --- Course Management Controllers ---
export const createCourse = async (req: Request, res: Response) => {
  const { title, description, coverImageUrl, price } = req.body;
  
  if (!title || !coverImageUrl) {
    return res.status(400).json({ error: 'Title and coverImageUrl are required.' });
  }

  try {
    let stripePriceId = null;

    if (price && Number(price) > 0) {
      const product = await stripe.products.create({ name: title });
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(Number(price) * 100),
        currency: 'eur',
      });
      stripePriceId = stripePrice.id;
    }

    const course = await prisma.videoCourse.create({
      data: { 
        title, 
        description, 
        coverImageUrl, 
        price: price ? Number(price) : null, 
        stripePriceId 
      },
    });
    res.status(201).json(course);
  } catch (error) {
    console.error("Course creation failed:", error);
    res.status(500).json({ error: 'Could not create course.' });
  }
};

export const updateCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { title, description, coverImageUrl, price } = req.body;

    try {
        const existingCourse = await prisma.videoCourse.findUnique({ where: { id: courseId } });
        if (!existingCourse) {
            return res.status(404).json({ error: 'Course not found' });
        }

        let stripePriceId = existingCourse.stripePriceId;

        // If price is being set or changed
        if (price !== undefined && Number(price) !== existingCourse.price) {
            // A simple implementation: create a new product/price.
            // A more complex one would update/archive old ones.
            if (Number(price) > 0) {
                const product = await stripe.products.create({ name: title });
                const stripePrice = await stripe.prices.create({
                    product: product.id,
                    unit_amount: Math.round(Number(price) * 100),
                    currency: 'eur',
                });
                stripePriceId = stripePrice.id;
            } else {
                stripePriceId = null; // Setting price to 0 or null
            }
        }

        const updatedCourse = await prisma.videoCourse.update({
            where: { id: courseId },
            data: { 
                title, 
                description, 
                coverImageUrl,
                price: price ? Number(price) : null,
                stripePriceId
            },
        });
        res.status(200).json(updatedCourse);
    } catch (error) {
        console.error("Course update failed:", error);
        res.status(500).json({ error: 'Could not update course.' });
    }
};

export const getAdminCourses = async (req: Request, res: Response) => {
    try {
        const coursesFromDb = await prisma.videoCourse.findMany({
            orderBy: { order: 'asc' },
            include: {
                sections: { select: { _count: { select: { videos: true } } } }
            }
        });
        const courses = coursesFromDb.map(course => {
            const totalVideos = course.sections.reduce((sum, section) => sum + section._count.videos, 0);
            const { sections, ...rest } = course;
            return { ...rest, totalVideos };
        });
        res.status(200).json(courses);
    } catch (error) {
        console.error('Error in getAdminCourses:', error);
        res.status(500).json({ error: 'Could not fetch courses.' });
    }
};

export const getCourseDetails = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    try {
        const course = await prisma.videoCourse.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: { videos: { orderBy: { order: 'asc' } } }
                }
            }
        });
        if (!course) return res.status(404).json({ error: 'Course not found.' });
        res.status(200).json(course);
    } catch (error) {
        res.status(500).json({ error: 'Could not fetch course details.' });
    }
};

export const createSection = async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const { title, order }: { title: string; order?: number } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  try {
    const section = await prisma.section.create({
      data: { title, order: order || 0, courseId },
    });
    res.status(201).json(section);
  } catch (error) {
    res.status(500).json({ error: 'Could not create section.' });
  }
};


export const addVideoToSection = async (req: Request, res: Response) => {
  const { sectionId } = req.params;
  // --- MODIFICATION START ---
  // Read all fields from the request body and add types
  const { title, vimeoId, duration, description, order }: { title: string; vimeoId: string; duration?: number; description?: string; order?: number } = req.body;
  // --- MODIFICATION END ---
  
  if (!title || !vimeoId) {
    return res.status(400).json({ error: 'Title and vimeoId are required.' });
  }
  try {
    const video = await prisma.video.create({
      data: {
        title,
        vimeoId,
        // --- MODIFICATION START ---
        // Use the values from the request, with fallbacks
        duration: duration || 0,
        description,
        order: order || 0,
        // --- MODIFICATION END ---
        sectionId: sectionId
      },
    });
    res.status(201).json(video);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not add video to section.' });
  }
};


export const deleteCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    try {
        await prisma.videoCourse.delete({ where: { id: courseId } });
        res.status(204).send(); // No Content
    } catch (error) {
        res.status(500).json({ error: 'Could not delete course.' });
    }
};

export const updateSection = async (req: Request, res: Response) => {
    const { sectionId } = req.params;
    const { title, order }: { title: string; order?: number } = req.body;
    try {
        const updatedSection = await prisma.section.update({
            where: { id: sectionId },
            data: { title, order },
        });
        res.status(200).json(updatedSection);
    } catch (error) {
        res.status(500).json({ error: 'Could not update section.' });
    }
};

export const deleteSection = async (req: Request, res: Response) => {
    const { sectionId } = req.params;
    try {
        await prisma.section.delete({ where: { id: sectionId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Could not delete section.' });
    }
};

export const updateVideo = async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const { title, vimeoId, description, duration, order }: { title: string; vimeoId: string; description?: string; duration?: number; order?: number } = req.body;
    try {
        const updatedVideo = await prisma.video.update({
            where: { id: videoId },
            data: { title, vimeoId, description, duration, order },
        });
        res.status(200).json(updatedVideo);
    } catch (error) {
        res.status(500).json({ error: 'Could not update video.' });
    }
};

export const deleteVideo = async (req: Request, res: Response) => {
    const { videoId } = req.params;
    try {
        await prisma.video.delete({ where: { id: videoId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Could not delete video.' });
    }
};

export const updateVideoOrder = async (req: Request, res: Response) => {
    const { videos }: { videos: { id: string, order: number }[] } = req.body;

    if (!Array.isArray(videos)) {
        return res.status(400).json({ error: 'A "videos" array is required.' });
    }

    try {
        const updatePromises = videos.map(video => 
            prisma.video.update({
                where: { id: video.id },
                data: { order: video.order },
            })
        );
        
        await prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Video order updated successfully.' });

    } catch (error) {
        console.error("Error updating video order:", error);
        res.status(500).json({ error: 'Could not update video order.' });
    }
};


export const getSettings = async (req: Request, res: Response) => {
    try {
        const settings = await prisma.setting.findMany();
        const settingsObject = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {} as { [key: string]: string });
        res.status(200).json(settingsObject);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

export const updateSettings = async (req: Request, res: Response) => {
    const settingsToUpdate: { [key: string]: string } = req.body;
    try {
        const updatePromises = Object.entries(settingsToUpdate).map(([key, value]) =>
            prisma.setting.upsert({
                where: { key },
                update: { value },
                create: { key, value },
            })
        );
        await prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Settings updated successfully.' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};