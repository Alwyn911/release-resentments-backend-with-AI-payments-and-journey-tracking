// AI Chatbot Routes - Claude Integration
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const User = require('../models/User');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Crisis keywords for detection
const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end it all', 'want to die', 'no reason to live',
  'self harm', 'hurt myself', 'cut myself', 'overdose',
  'hopeless', 'can\'t go on', 'better off dead', 'harm others',
  'kill someone', 'revenge', 'make them pay'
];

// Check for crisis indicators
function detectCrisis(message) {
  const lowerMessage = message.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Build context for AI based on user data
function buildUserContext(user, currentJourney) {
  const context = {
    screenName: user.screenName,
    subscriptionTier: user.subscriptionTier,
    totalJourneys: user.stats.totalJourneysStarted,
    completedJourneys: user.stats.totalJourneysCompleted,
    completedResources: user.stats.totalResourcesCompleted,
    currentStreak: user.stats.currentStreak
  };

  if (currentJourney) {
    context.currentJourney = {
      journeyNumber: currentJourney.journeyNumber,
      currentStep: currentJourney.currentStep,
      completedSteps: currentJourney.completedSteps,
      resentmentDescription: currentJourney.resentmentDescription
    };
  }

  return context;
}

// Generate system prompt for AI coach
function generateSystemPrompt(userContext) {
  const stepNames = ['Recognize', 'Examine', 'Learn', 'Embrace', 'Affirm', 'Sustain', 'Evolve'];
  const currentStepName = userContext.currentJourney 
    ? stepNames[userContext.currentJourney.currentStep - 1]
    : 'beginning';

  return `You are a compassionate forgiveness coach for the RELEASE Resentments app. You help users work through resentments using the 7-step RELEASE method:

R - Recognize: Identify and acknowledge resentments
E - Examine: Explore roots and patterns
L - Learn: Practice cognitive reframing techniques
E - Embrace: Shift perspective and find understanding
A - Affirm: Create personal affirmations
S - Sustain: Develop maintenance practices
E - Evolve: Integrate growth and wisdom

Current User Context:
- Screen Name: ${userContext.screenName}
- Subscription: ${userContext.subscriptionTier}
- Total Journeys Started: ${userContext.totalJourneys}
- Completed Journeys: ${userContext.completedJourneys}
${userContext.currentJourney ? `
- Current Journey: #${userContext.currentJourney.journeyNumber}
- Current Step: ${userContext.currentJourney.currentStep} (${currentStepName})
- Working on: ${userContext.currentJourney.resentmentDescription}
- Completed Steps: ${userContext.currentJourney.completedSteps.join(', ')}
` : ''}

Guidelines:
- Be empathetic, warm, and non-judgmental
- Use "I understand" not "I know"
- Offer choices, not commands
- Validate emotions first, then guide
- Keep responses concise (2-3 paragraphs max)
- End with a question or gentle action suggestion
- Focus on the user's current step in their journey
- Remind them that forgiveness is for their freedom, not about the other person
- Never diagnose mental health conditions
- If detecting crisis language, immediately provide crisis resources

CRITICAL: If you detect self-harm, suicide ideation, or harm to others, immediately provide:
National Suicide Prevention Lifeline: 988
Crisis Text Line: Text HOME to 741741
And encourage them to seek immediate professional help.

Maintain a therapeutic but accessible tone - you're a supportive coach, not a replacement for therapy.`;
}

// POST /api/ai/chat - Main chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { userId, message, sessionId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: 'Message and userId required' });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check premium access for AI coach
    if (!user.hasPremiumAccess()) {
      return res.status(403).json({ 
        error: 'AI coach is a premium feature',
        message: 'Upgrade to premium to access 24/7 AI coaching support'
      });
    }

    // Detect crisis
    const isCrisis = detectCrisis(message);

    // Get current active journey
    const currentJourney = user.journeys.find(j => j.status === 'active');
    
    // Build context
    const userContext = buildUserContext(user, currentJourney);

    // Get or create conversation history
    let conversation = user.aiConversations.find(c => c.sessionId === sessionId);
    if (!conversation) {
      conversation = {
        conversationId: `conv_${Date.now()}`,
        sessionId: sessionId || `session_${Date.now()}`,
        messages: [],
        context: userContext,
        startedAt: new Date(),
        lastMessageAt: new Date()
      };
      user.aiConversations.push(conversation);
    }

    // Add user message to history
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Prepare messages for Claude API
    const messages = conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: generateSystemPrompt(userContext),
      messages: messages
    });

    const aiResponse = response.content[0].text;

    // Add AI response to history
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });

    conversation.lastMessageAt = new Date();

    // Update user stats
    if (conversation.messages.length === 2) {
      // First message in conversation
      user.stats.totalAIConversations += 1;
    }
    user.stats.lastActiveDate = new Date();

    await user.save();

    res.json({
      success: true,
      response: {
        message: aiResponse,
        sessionId: conversation.sessionId,
        isCrisis: isCrisis,
        crisisResources: isCrisis ? {
          suicidePreventionLifeline: '988',
          crisisTextLine: 'Text HOME to 741741',
          message: 'If you are in immediate danger, please call 911 or go to your nearest emergency room.'
        } : null
      },
      metadata: {
        conversationId: conversation.conversationId,
        messageCount: conversation.messages.length,
        userContext: {
          currentStep: currentJourney?.currentStep || null,
          stepName: currentJourney ? 
            ['Recognize', 'Examine', 'Learn', 'Embrace', 'Affirm', 'Sustain', 'Evolve'][currentJourney.currentStep - 1] 
            : null
        }
      }
    });

  } catch (error) {
    console.error('AI chat error:', error);
    
    // Provide helpful fallback
    res.status(500).json({ 
      error: 'AI coach temporarily unavailable',
      fallback: {
        message: "I'm having trouble connecting right now. In the meantime, try reviewing your current step's resources, or join our next live group session for support. You can also email support@resentmentrelease.com for assistance.",
        supportEmail: 'support@resentmentrelease.com'
      }
    });
  }
});

// GET /api/ai/conversation-history/:userId - Get user's conversation history
router.get('/conversation-history/:userId', async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.hasPremiumAccess()) {
      return res.status(403).json({ error: 'Premium feature' });
    }

    let conversations = user.aiConversations;

    // Filter by session if provided
    if (sessionId) {
      conversations = conversations.filter(c => c.sessionId === sessionId);
    }

    // Sort by most recent
    conversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    // Limit to last 50 conversations
    conversations = conversations.slice(0, 50);

    res.json({
      success: true,
      conversations: conversations.map(c => ({
        conversationId: c.conversationId,
        sessionId: c.sessionId,
        messageCount: c.messages.length,
        startedAt: c.startedAt,
        lastMessageAt: c.lastMessageAt,
        preview: c.messages[c.messages.length - 1]?.content.substring(0, 100) + '...'
      }))
    });

  } catch (error) {
    console.error('Get conversation history error:', error);
    res.status(500).json({ error: 'Failed to get conversation history' });
  }
});

// GET /api/ai/conversation/:conversationId - Get full conversation
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { userId } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const conversation = user.aiConversations.find(
      c => c.conversationId === req.params.conversationId
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation: {
        conversationId: conversation.conversationId,
        sessionId: conversation.sessionId,
        messages: conversation.messages,
        context: conversation.context,
        startedAt: conversation.startedAt,
        lastMessageAt: conversation.lastMessageAt
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// DELETE /api/ai/conversation/:conversationId - Delete conversation
router.delete('/conversation/:conversationId', async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.aiConversations = user.aiConversations.filter(
      c => c.conversationId !== req.params.conversationId
    );

    await user.save();

    res.json({
      success: true,
      message: 'Conversation deleted'
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// POST /api/ai/journey-support - Get AI guidance for specific journey step
router.post('/journey-support', async (req, res) => {
  try {
    const { userId, journeyNumber, stepNumber } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.hasPremiumAccess()) {
      return res.status(403).json({ error: 'Premium feature' });
    }

    const journey = user.journeys.find(j => j.journeyNumber === journeyNumber);
    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    const stepNames = ['Recognize', 'Examine', 'Learn', 'Embrace', 'Affirm', 'Sustain', 'Evolve'];
    const stepName = stepNames[stepNumber - 1];

    const stepGuidance = {
      1: "In the Recognize step, acknowledge your resentment without judgment. Name it, identify who it's toward, and how it affects you physically and emotionally.",
      2: "In the Examine step, explore the roots of your resentment. When did it start? What patterns do you notice? What unmet needs or values are involved?",
      3: "In the Learn step, practice cognitive reframing. Challenge thoughts like 'always' and 'never'. Look for alternative perspectives and more balanced views.",
      4: "In the Embrace step, work on shifting your perspective. Try to understand the other person's viewpoint, their struggles, and their humanity.",
      5: "In the Affirm step, create personal affirmations that support your healing. Replace old narratives with empowering truths about yourself and forgiveness.",
      6: "In the Sustain step, develop practices to maintain your progress. Create daily rituals, identify triggers, and build a support system.",
      7: "In the Evolve step, integrate what you've learned. Recognize your growth, share your wisdom, and celebrate your transformation."
    };

    res.json({
      success: true,
      guidance: {
        step: stepNumber,
        stepName: stepName,
        description: stepGuidance[stepNumber],
        journey: {
          number: journey.journeyNumber,
          resentment: journey.resentmentDescription,
          completedSteps: journey.completedSteps
        }
      }
    });

  } catch (error) {
    console.error('Journey support error:', error);
    res.status(500).json({ error: 'Failed to get journey support' });
  }
});

module.exports = router;