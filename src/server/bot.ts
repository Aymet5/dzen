import { Telegraf, Markup } from 'telegraf';
import { getUser, createUser, updateSubscription } from './db';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN is not defined in environment variables.');
}

export const bot = new Telegraf(token || 'DUMMY_TOKEN');

const TRIAL_DAYS = 3;
const REQUIRED_CHANNEL_ID = process.env.REQUIRED_CHANNEL_ID || '@dzen17vpn';
const APP_URL = process.env.APP_URL || 'https://example.com';

// Helper to check if user has active subscription or trial
const hasAccess = (userId: number) => {
  const user = getUser(userId);
  if (!user) return false;

  const now = new Date();
  
  // Check subscription
  if (user.subscription_expires_at) {
    const expiresAt = new Date(user.subscription_expires_at);
    if (now < expiresAt) return true;
  }

  // Check trial
  const trialStartedAt = new Date(user.trial_started_at);
  const trialExpiresAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  
  return now < trialExpiresAt;
};

// Start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || null;

  createUser(userId, username, firstName);

  // Set the menu button for the user
  try {
    await ctx.setChatMenuButton({
      type: 'web_app',
      text: 'Dzen VPN',
      web_app: { url: APP_URL }
    });
  } catch (e) {
    console.error('Failed to set menu button', e);
  }

  const welcomeMessage = `
Привет, ${firstName || 'друг'}! 🧘‍♂️

Добро пожаловать в **Dzen VPN**. 
Твой спокойный и безопасный интернет.

🎁 Тебе доступен **пробный период на 3 дня**.

❗️ Для использования бота подпишись на канал: ${REQUIRED_CHANNEL_ID}
  `;

  await ctx.reply(welcomeMessage, Markup.inlineKeyboard([
    [Markup.button.url('Подписаться на канал', `https://t.me/${REQUIRED_CHANNEL_ID.replace('@', '')}`)],
    [Markup.button.webApp('🧘‍♂️ Открыть Dzen VPN', APP_URL)],
    [Markup.button.callback('🚀 Получить конфигурацию', 'get_config')],
    [Markup.button.callback('💳 Оплатить подписку', 'pay_sub')]
  ]));
});

// Callback query for getting config
bot.action('get_config', async (ctx) => {
  const userId = ctx.from.id;

  // Check channel subscription if REQUIRED_CHANNEL_ID is set
  if (REQUIRED_CHANNEL_ID) {
    try {
      const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL_ID, userId);
      if (['left', 'kicked'].includes(chatMember.status)) {
        return ctx.answerCbQuery('❌ Вы не подписаны на канал!', { show_alert: true });
      }
    } catch (error) {
      console.error('Error checking channel subscription:', error);
      // If bot is not admin in channel, it will throw an error.
    }
  }

  if (hasAccess(userId)) {
    // Send configuration
    const configMessage = `
🛠 **Конфигурации скоро будут доступны!**

В данный момент идут технические работы по настройке серверов. 
Пожалуйста, подождите немного, мы сообщим, когда всё будет готово.
    `;
    await ctx.reply(configMessage, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
  } else {
    await ctx.answerCbQuery('❌ Пробный период или подписка истекли.', { show_alert: true });
    await ctx.reply('Твой пробный период или подписка закончились. Пожалуйста, оплати подписку.', Markup.inlineKeyboard([
      [Markup.button.callback('💳 Оплатить подписку', 'pay_sub')]
    ]));
  }
});

// Callback query for payment
bot.action('pay_sub', async (ctx) => {
  const userId = ctx.from.id;
  const providerToken = process.env.PAYMENT_PROVIDER_TOKEN;

  if (!providerToken) {
    return ctx.answerCbQuery('❌ Оплата пока не настроена (отсутствует токен провайдера).', { show_alert: true });
  }

  const invoice = {
    title: 'Подписка на VPN (1 месяц)',
    description: 'Безлимитный доступ к VPN на 30 дней.',
    payload: `sub_1_month_${userId}`,
    provider_token: providerToken,
    currency: 'RUB',
    prices: [{ label: 'Подписка на 1 месяц', amount: 15000 }], // 150.00 RUB (сумма в копейках)
  };

  try {
    await ctx.replyWithInvoice(invoice);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error sending invoice:', error);
    await ctx.answerCbQuery('❌ Ошибка при создании платежа. Убедитесь, что токен провайдера настроен правильно.', { show_alert: true });
  }
});

// Handle pre-checkout query (required for payments)
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// Handle successful payment
bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  // @ts-ignore - successful_payment exists on message but TypeScript might not know it depending on the version
  const payment = ctx.message?.successful_payment;
  
  if (payment && payment.invoice_payload.startsWith('sub_1_month_')) {
    const user = getUser(userId);
    let newExpiry = new Date();
    
    // If user already has an active subscription, add 30 days to it
    if (user && user.subscription_expires_at) {
      const currentExpiry = new Date(user.subscription_expires_at);
      if (currentExpiry > new Date()) {
        newExpiry = currentExpiry;
      }
    }
    
    newExpiry.setDate(newExpiry.getDate() + 30);
    updateSubscription(userId, newExpiry.toISOString());

    await ctx.reply('✅ Оплата успешно получена! Ваша подписка продлена на 30 дней.\nНажмите /start чтобы получить конфигурацию.');
  }
});

// Handle Web App data
bot.on('web_app_data', async (ctx) => {
  try {
    // @ts-ignore
    const data = JSON.parse(ctx.message?.web_app_data?.data || '{}');
    
    if (data.action === 'get_config') {
      // Simulate clicking the "get_config" button
      await ctx.reply('Обработка запроса конфигурации...');
      // We can't directly call the action handler, so we just send the same message
      const userId = ctx.from.id;
      if (hasAccess(userId)) {
        const configMessage = `
🛠 **Конфигурации скоро будут доступны!**

В данный момент идут технические работы по настройке серверов. 
Пожалуйста, подождите немного, мы сообщим, когда всё будет готово.
        `;
        await ctx.reply(configMessage, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply('Твой пробный период или подписка закончились. Пожалуйста, оплати подписку.', Markup.inlineKeyboard([
          [Markup.button.callback('💳 Оплатить подписку', 'pay_sub')]
        ]));
      }
    } else if (data.action === 'pay_sub') {
      // Simulate clicking the "pay_sub" button
      const userId = ctx.from.id;
      const providerToken = process.env.PAYMENT_PROVIDER_TOKEN;

      if (!providerToken) {
        return ctx.reply('❌ Оплата пока не настроена (отсутствует токен провайдера).');
      }

      const invoice = {
        title: 'Подписка на VPN (1 месяц)',
        description: 'Безлимитный доступ к VPN на 30 дней.',
        payload: `sub_1_month_${userId}`,
        provider_token: providerToken,
        currency: 'RUB',
        prices: [{ label: 'Подписка на 1 месяц', amount: 15000 }],
      };

      await ctx.replyWithInvoice(invoice);
    }
  } catch (e) {
    console.error('Error handling web app data:', e);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
});
