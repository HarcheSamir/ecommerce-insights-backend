// src/api/training/training.controller.ts

import { Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

/**
 * @description Fetches all video courses.
 */
export const getAllCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId; // Get the user from the token

    const courses = await prisma.videoCourse.findMany({
      orderBy: { order: 'asc' },
      include: {
        _count: {
          select: { videos: true },
        },
        videos: {
          select: {
            id: true,
            progress: {
              where: { 
                userId: userId,
                completed: true 
              },
            },
          },
        },
      },
    });

    const coursesWithProgress = courses.map(course => {
      const totalVideos = course._count.videos;
      const completedVideos = course.videos.filter(video => video.progress.length > 0).length;
      
      const { _count, videos, ...rest } = course;

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
 * @description Fetches a single course and its videos, including the current user's progress.
 */
export const getCourseById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.user!.userId; 

    const course = await prisma.videoCourse.findUnique({
      where: { id: courseId },
      include: {
        videos: {
          orderBy: { order: 'asc' },
          include: {
            progress: {
              where: { userId },
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
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Updates or creates a progress record for a video.
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
      where: {
        userId_videoId: { userId, videoId },
      },
      update: progressData,
      create: progressData,
    });

    return res.status(200).json({ message: 'Progress updated successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};