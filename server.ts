import express from 'express';
import { createServer as createViteServer } from 'vite';
import { bot } from './src/server/bot';
import { getAllUsers } from './src/server/db';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Start Telegram Bot
  if (process.env.TELEGRAM_BOT_TOKEN) {
    bot.launch().then(() => {
      console.log('Telegram bot started successfully!');
    }).catch((err) => {
      console.error('Failed to start Telegram bot:', err);
    });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.warn('TELEGRAM_BOT_TOKEN missing. Bot is not running.');
  }

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/users', (req, res) => {
    try {
      const users = getAllUsers();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static('dist'));
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
