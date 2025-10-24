// FILE: ./src/api/training/training.controller.ts
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
        // This calculates the TOTAL number of videos in the course
        _count: {
          select: { videos: true },
        },
        // --- THIS IS THE FIX ---
        // We now explicitly fetch the videos and their progress FOR THE CURRENT USER
        // to calculate the COMPLETED video count.
        videos: {
          select: {
            id: true, // We only need the ID to correlate
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

    // This logic now works correctly because `video.progress` will contain a record
    // if the user has completed it.
    const coursesWithProgress = courses.map(course => {
      const totalVideos = course._count.videos;
      const completedVideos = course.videos.filter(video => video.progress.length > 0).length;

      // We remove the detailed `_count` and `videos` objects before sending to the client
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
          select: {
            id: true,
            title: true,
            description: true,
            vimeoId: true,
            duration: true,
            order: true,
            courseId: true,
            progress: {
              where: { userId },
            },
          },
          orderBy: { order: 'asc' },
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