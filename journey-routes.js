// Journey Tracking Routes
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST /api/journeys/start - Start a new journey
router.post('/start', async (req, res) => {
  try {
    const { userId, resentmentDescription } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if premium required for multiple journeys
    if (!user.hasPremiumAccess()) {
      const activeJourneys = user.journeys.filter(j => j.status === 'active').length;
      if (activeJourneys >= 1) {
        return res.status(403).json({ 
          error: 'Premium required for multiple journeys',
          message: 'Upgrade to premium for unlimited journeys'
        });
      }
    }

    // Create new journey
    const journeyNumber = user.stats.totalJourneysStarted + 1;
    
    const newJourney = {
      journeyNumber,
      resentmentDescription,
      currentStep: 1,
      completedSteps: [],
      startDate: new Date(),
      status: 'active'
    };

    user.journeys.push(newJourney);
    user.stats.totalJourneysStarted += 1;
    user.stats.lastActiveDate = new Date();

    await user.save();

    res.json({
      success: true,
      message: 'Journey started successfully',
      journey: {
        journeyNumber,
        resentmentDescription,
        currentStep: 1,
        status: 'active',
        startDate: newJourney.startDate
      }
    });

  } catch (error) {
    console.error('Start journey error:', error);
    res.status(500).json({ error: 'Failed to start journey' });
  }
});

// PUT /api/journeys/:journeyNumber/step - Update journey step
router.put('/:journeyNumber/step', async (req, res) => {
  try {
    const { userId, stepNumber, completed } = req.body;
    const journeyNumber = parseInt(req.params.journeyNumber);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const journey = user.journeys.find(j => j.journeyNumber === journeyNumber);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    if (completed) {
      // Mark step as completed
      if (!journey.completedSteps.includes(stepNumber)) {
        journey.completedSteps.push(stepNumber);
        journey.completedSteps.sort((a, b) => a - b);
      }

      // Move to next step if not already there
      if (stepNumber === journey.currentStep && stepNumber < 7) {
        journey.currentStep = stepNumber + 1;
      }

      // Check if journey is complete
      if (journey.completedSteps.length === 7) {
        journey.status = 'completed';
        journey.completedDate = new Date();
        user.stats.totalJourneysCompleted += 1;
      }
    } else {
      // Just moving to a step
      journey.currentStep = stepNumber;
    }

    user.stats.lastActiveDate = new Date();
    await user.save();

    res.json({
      success: true,
      journey: {
        journeyNumber: journey.journeyNumber,
        currentStep: journey.currentStep,
        completedSteps: journey.completedSteps,
        status: journey.status,
        isComplete: journey.status === 'completed'
      }
    });

  } catch (error) {
    console.error('Update journey step error:', error);
    res.status(500).json({ error: 'Failed to update journey step' });
  }
});

// GET /api/journeys/:userId - Get user's journeys
router.get('/:userId', async (req, res) => {
  try {
    const { status } = req.query; // active, completed, paused, or all

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let journeys = user.journeys;

    // Filter by status if specified
    if (status && status !== 'all') {
      journeys = journeys.filter(j => j.status === status);
    }

    // Sort by start date (most recent first)
    journeys.sort((a, b) => b.startDate - a.startDate);

    res.json({
      success: true,
      journeys: journeys.map(j => ({
        journeyNumber: j.journeyNumber,
        resentmentDescription: j.resentmentDescription,
        currentStep: j.currentStep,
        completedSteps: j.completedSteps,
        status: j.status,
        startDate: j.startDate,
        completedDate: j.completedDate,
        progress: Math.round((j.completedSteps.length / 7) * 100)
      })),
      stats: {
        total: user.journeys.length,
        active: user.journeys.filter(j => j.status === 'active').length,
        completed: user.journeys.filter(j => j.status === 'completed').length
      }
    });

  } catch (error) {
    console.error('Get journeys error:', error);
    res.status(500).json({ error: 'Failed to get journeys' });
  }
});

// GET /api/journeys/:userId/:journeyNumber - Get specific journey
router.get('/:userId/:journeyNumber', async (req, res) => {
  try {
    const journeyNumber = parseInt(req.params.journeyNumber);

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const journey = user.journeys.find(j => j.journeyNumber === journeyNumber);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    const stepNames = ['Recognize', 'Examine', 'Learn', 'Embrace', 'Affirm', 'Sustain', 'Evolve'];

    res.json({
      success: true,
      journey: {
        journeyNumber: journey.journeyNumber,
        resentmentDescription: journey.resentmentDescription,
        currentStep: {
          number: journey.currentStep,
          name: stepNames[journey.currentStep - 1]
        },
        completedSteps: journey.completedSteps.map(num => ({
          number: num,
          name: stepNames[num - 1]
        })),
        status: journey.status,
        startDate: journey.startDate,
        completedDate: journey.completedDate,
        progress: Math.round((journey.completedSteps.length / 7) * 100),
        daysActive: journey.completedDate 
          ? Math.ceil((journey.completedDate - journey.startDate) / (1000 * 60 * 60 * 24))
          : Math.ceil((new Date() - journey.startDate) / (1000 * 60 * 60 * 24))
      }
    });

  } catch (error) {
    console.error('Get journey error:', error);
    res.status(500).json({ error: 'Failed to get journey' });
  }
});

// PUT /api/journeys/:journeyNumber/pause - Pause a journey
router.put('/:journeyNumber/pause', async (req, res) => {
  try {
    const { userId } = req.body;
    const journeyNumber = parseInt(req.params.journeyNumber);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const journey = user.journeys.find(j => j.journeyNumber === journeyNumber);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    journey.status = 'paused';
    await user.save();

    res.json({
      success: true,
      message: 'Journey paused',
      journey: {
        journeyNumber: journey.journeyNumber,
        status: journey.status
      }
    });

  } catch (error) {
    console.error('Pause journey error:', error);
    res.status(500).json({ error: 'Failed to pause journey' });
  }
});

// PUT /api/journeys/:journeyNumber/resume - Resume a paused journey
router.put('/:journeyNumber/resume', async (req, res) => {
  try {
    const { userId } = req.body;
    const journeyNumber = parseInt(req.params.journeyNumber);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const journey = user.journeys.find(j => j.journeyNumber === journeyNumber);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    journey.status = 'active';
    user.stats.lastActiveDate = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Journey resumed',
      journey: {
        journeyNumber: journey.journeyNumber,
        status: journey.status,
        currentStep: journey.currentStep
      }
    });

  } catch (error) {
    console.error('Resume journey error:', error);
    res.status(500).json({ error: 'Failed to resume journey' });
  }
});

// POST /api/journeys/complete-resource - Mark resource as completed
router.post('/complete-resource', async (req, res) => {
  try {
    const { userId, resourceId, resourceName } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if resource already completed
    const existingResource = user.completedResources.find(r => r.resourceId === resourceId);
    
    if (existingResource) {
      // Increment times completed
      existingResource.timesCompleted += 1;
      existingResource.completedAt = new Date();
    } else {
      // Add new completed resource
      user.completedResources.push({
        resourceId,
        resourceName,
        completedAt: new Date(),
        timesCompleted: 1
      });
      user.stats.totalResourcesCompleted += 1;
    }

    user.stats.lastActiveDate = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Resource marked as completed',
      resource: {
        resourceId,
        resourceName,
        timesCompleted: existingResource ? existingResource.timesCompleted : 1
      },
      totalCompleted: user.stats.totalResourcesCompleted
    });

  } catch (error) {
    console.error('Complete resource error:', error);
    res.status(500).json({ error: 'Failed to mark resource as completed' });
  }
});

// GET /api/journeys/:userId/stats - Get user journey statistics
router.get('/:userId/stats', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const activeJourneys = user.journeys.filter(j => j.status === 'active');
    const completedJourneys = user.journeys.filter(j => j.status === 'completed');
    
    // Calculate average completion time
    let avgCompletionDays = 0;
    if (completedJourneys.length > 0) {
      const totalDays = completedJourneys.reduce((sum, j) => {
        const days = Math.ceil((j.completedDate - j.startDate) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);
      avgCompletionDays = Math.round(totalDays / completedJourneys.length);
    }

    res.json({
      success: true,
      stats: {
        totalJourneys: user.stats.totalJourneysStarted,
        activeJourneys: activeJourneys.length,
        completedJourneys: user.stats.totalJourneysCompleted,
        completedResources: user.stats.total