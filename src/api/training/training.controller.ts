import { Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

/**
 * @description Fetches all video courses with updated progress calculation across sections.
 */
export const getAllCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const coursesFromDb = await prisma.videoCourse.findMany({
      orderBy: { order: 'asc' },
      include: {
        sections: {
          select: {
            videos: {
              select: {
                id: true,
                progress: {
                  where: { userId: userId, completed: true },
                },
              },
            },
          },
        },
      },
    });

    const coursesWithProgress = coursesFromDb.map(course => {
      let totalVideos = 0;
      let completedVideos = 0;
      
      course.sections.forEach(section => {
        totalVideos += section.videos.length;
        completedVideos += section.videos.filter(video => video.progress.length > 0).length;
      });

      const { sections, ...rest } = course;

      return {
        ...rest,
        totalVideos,
        completedVideos,
      };
    });

    return res.status(200).json(coursesWithProgress);
  } catch (error) {
    console.error('Error fetching courses with progress:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Fetches a single course with its sections/videos for the user.
 */
export const getCourseById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.user!.userId;

    const course = await prisma.videoCourse.findUnique({
      where: { id: courseId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            videos: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                vimeoId: true,
                duration: true,
                order: true,
                progress: {
                  where: { userId },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    return res.status(200).json(course);
  } catch (error) {
    console.error('Error fetching course by ID:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Updates or creates a progress record for a video.
 * (This function remains unchanged)
 */
export const updateVideoProgress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = req.user!.userId;
    const { completed } = req.body as { completed: boolean };

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'The "completed" field is required and must be a boolean.' });
    }

    const progressData = {
      userId,
      videoId,
      completed,
      completedAt: completed ? new Date() : null,
    };

    await prisma.videoProgress.upsert({
      where: { userId_videoId: { userId, videoId } },
      update: progressData,
      create: progressData,
    });

    return res.status(200).json({ message: 'Progress updated successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};