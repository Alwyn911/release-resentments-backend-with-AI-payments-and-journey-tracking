// Stripe Payment & Subscription Routes
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');

// Coupon codes and their discounts
const COUPONS = {
  'RELEASE50': { 
    discount: 50, 
    type: 'percent',
    description: '50% off first month'
  },
  'FREESTUDY': { 
    discount: 100, 
    type: 'percent',
    description: 'First month free'
  }
};

// POST /api/stripe/create-checkout-session - Create Stripe checkout
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { userId, couponCode } = req.body;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if coupon already used
    if (couponCode && user.couponsUsed.some(c => c.code === couponCode)) {
      return res.status(400).json({ error: 'Coupon already used' });
    }

    // Validate coupon
    let couponDetails = null;
    if (couponCode && COUPONS[couponCode.toUpperCase()]) {
      couponDetails = COUPONS[couponCode.toUpperCase()];
    }

    // Create or get Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user._id.toString(),
          screenName: user.screenName
        }
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Create checkout session configuration
    const sessionConfig = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // Your $9.95/month price ID
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription-canceled`,
      metadata: {
        userId: user._id.toString(),
        couponCode: couponCode || 'none'
      },
      subscription_data: {
        metadata: {
          userId: user._id.toString()
        }
      }
    };

    // Apply coupon if valid
    if (couponDetails) {
      // Create Stripe coupon
      const stripeCoupon = await stripe.coupons.create({
        percent_off: couponDetails.discount,
        duration: 'once', // Apply to first payment only
        name: couponCode
      });

      sessionConfig.discounts = [{
        coupon: stripeCoupon.id
      }];
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      appliedCoupon: couponDetails ? {
        code: couponCode,
        discount: couponDetails.discount,
        description: couponDetails.description
      } : null
    });

  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/stripe/webhook - Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook Handlers
async function handleCheckoutCompleted(session) {
  const userId = session.metadata.userId;
  const couponCode = session.metadata.couponCode;

  const user = await User.findById(userId);
  if (!user) return;

  // Record coupon usage
  if (couponCode && couponCode !== 'none') {
    user.couponsUsed.push({
      code: couponCode,
      usedAt: new Date()
    });
  }

  user.stripeSubscriptionId = session.subscription;
  await user.save();

  console.log(`✅ Checkout completed for user ${user.screenName}`);
}

async function handleSubscriptionCreated(subscription) {
  const user = await User.findOne({ stripeCustomerId: subscription.customer });
  if (!user) return;

  user.subscriptionTier = 'premium';
  user.subscriptionStatus = subscription.status;
  user.stripeSubscriptionId = subscription.id;
  user.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
  user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);

  await user.save();

  console.log(`✅ Subscription created for user ${user.screenName}`);
}

async function handleSubscriptionUpdated(subscription) {
  const user = await User.findOne({ stripeSubscriptionId: subscription.id });
  if (!user) return;

  user.subscriptionStatus = subscription.status;
  user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);

  // Handle cancellation
  if (subscription.cancel_at_period_end) {
    user.subscriptionStatus = 'canceled';
  }

  await user.save();

  console.log(`✅ Subscription updated for user ${user.screenName}: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription) {
  const user = await User.findOne({ stripeSubscriptionId: subscription.id });
  if (!user) return;

  user.subscriptionTier = 'free';
  user.subscriptionStatus = 'none';
  user.subscriptionEndDate = new Date();

  await user.save();

  console.log(`✅ Subscription deleted for user ${user.screenName}`);
}

async function handlePaymentSucceeded(invoice) {
  const user = await User.findOne({ stripeCustomerId: invoice.customer });
  if (!user) return;

  console.log(`✅ Payment succeeded for user ${user.screenName}: $${invoice.amount_paid / 100}`);
}

async function handlePaymentFailed(invoice) {
  const user = await User.findOne({ stripeCustomerId: invoice.customer });
  if (!user) return;

  user.subscriptionStatus = 'past_due';
  await user.save();

  console.log(`⚠️ Payment failed for user ${user.screenName}`);
}

// GET /api/stripe/subscription-status - Get user's subscription status
router.get('/subscription-status/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let subscriptionDetails = null;

    if (user.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      subscriptionDetails = {
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        plan: {
          amount: subscription.items.data[0].price.unit_amount / 100,
          interval: subscription.items.data[0].price.recurring.interval
        }
      };
    }

    res.json({
      success: true,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      hasPremiumAccess: user.hasPremiumAccess(),
      subscriptionDetails,
      couponsUsed: user.couponsUsed
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// POST /api/stripe/cancel-subscription - Cancel subscription
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    // Cancel at period end (don't immediately revoke access)
    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    user.subscriptionStatus = 'canceled';
    await user.save();

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period',
      endsAt: new Date(subscription.current_period_end * 1000)
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /api/stripe/reactivate-subscription - Reactivate canceled subscription
router.post('/reactivate-subscription', async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No subscription to reactivate' });
    }

    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: false }
    );

    user.subscriptionStatus = 'active';
    await user.save();

    res.json({
      success: true,
      message: 'Subscription reactivated successfully'
    });

  } catch (error) {
    console.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// POST /api/stripe/validate-coupon - Validate coupon code
router.post('/validate-coupon', async (req, res) => {
  try {
    const { couponCode, userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const code = couponCode.toUpperCase();

    // Check if valid coupon
    if (!COUPONS[code]) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Invalid coupon code' 
      });
    }

    // Check if already used
    if (user.couponsUsed.some(c => c.code === code)) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Coupon already used' 
      });
    }

    res.json({
      valid: true,
      coupon: {
        code: code,
        discount: COUPONS[code].discount,
        description: COUPONS[code].description,
        originalPrice: 9.95,
        discountedPrice: COUPONS[code].discount === 100 ? 0 : 
          (9.95 * (1 - COUPONS[code].discount / 100)).toFixed(2)
      }
    });

  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

module.exports = router;