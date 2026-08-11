// Main API Entry Point

import Fastify from 'fastify';
import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: parseInt(process.env.PORT || '3001'),
      host: '0.0.0.0',
    });
    console.log(`🚀 API server running at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
