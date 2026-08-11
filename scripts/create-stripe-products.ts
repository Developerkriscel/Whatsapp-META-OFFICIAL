/**
 * Stripe Setup Script
 * Run this to automatically create products and prices in your Stripe account
 *
 * Usage: node scripts/create-stripe-products.js
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

async function createProducts() {
  console.log('🚀 Creating Stripe products and prices...\n');

  const products = [
    {
      name: 'WhatsApp SaaS - Starter',
      description: 'Perfect for small businesses just getting started with WhatsApp messaging.',
      prices: [
        { amount: 4900, interval: 'month' as const, nickname: 'Starter Monthly' },
        { amount: 47000, interval: 'year' as const, nickname: 'Starter Annual' },
      ],
    },
    {
      name: 'WhatsApp SaaS - Growth',
      description: 'For growing teams that need automation, chatbot builder, and API access.',
      prices: [
        { amount: 14900, interval: 'month' as const, nickname: 'Growth Monthly' },
        { amount: 143000, interval: 'year' as const, nickname: 'Growth Annual' },
      ],
    },
    {
      name: 'WhatsApp SaaS - Business',
      description: 'Full-featured with AI chatbot, WhatsApp Flows, and advanced analytics.',
      prices: [
        { amount: 39900, interval: 'month' as const, nickname: 'Business Monthly' },
        { amount: 383000, interval: 'year' as const, nickname: 'Business Annual' },
      ],
    },
  ];

  const results: Record<string, string> = {};

  for (const productData of products) {
    console.log(`📦 Creating product: ${productData.name}`);

    const product = await stripe.products.create({
      name: productData.name,
      description: productData.description,
    });

    console.log(`   ✅ Product created: ${product.id}`);

    for (const priceData of productData.prices) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: priceData.amount,
        currency: 'usd',
        recurring: { interval: priceData.interval },
        nickname: priceData.nickname,
      });

      const tierName = productData.name.split(' - ')[1].toLowerCase();
      const intervalName = priceData.interval === 'month' ? 'monthly' : 'annual';
      const key = `STRIPE_PRICE_${tierName.toUpperCase()}_${intervalName.toUpperCase()}`;
      results[key] = price.id;

      console.log(`   💰 ${priceData.nickname}: ${price.id}`);
    }
    console.log();
  }

  console.log('='.repeat(60));
  console.log('✅ All products created! Add these to your .env file:');
  console.log('='.repeat(60));
  console.log();

  for (const [key, value] of Object.entries(results)) {
    console.log(`${key}=${value}`);
  }

  console.log();
}

createProducts().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});