import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { getUser, createUser, updateSubscription, updateLastMessageId, startTrial, getExpiredUsers, setExpiryNotified, getStats, getAllUsers, updateVpnConfig } from './db';
import { createVpnClient } from '../services/vpnService';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN is not defined in environment variables.');
}

export const bot = new Telegraf(token || 'DUMMY_TOKEN');

const TRIAL_DAYS = 3;
const REQUIRED_CHANNEL_ID = process.env.REQUIRED_CHANNEL_ID || '@dzen17vpn';
const APP_URL = process.env.APP_URL || 'https://example.com';
const ADMIN_ID = 5446101221; // Your ID

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
  if (user.trial_started_at) {
    const trialStartedAt = new Date(user.trial_started_at);
    const trialExpiresAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    return now < trialExpiresAt;
  }
  
  return false;
};

// Helper to cleanup previous bot message
const cleanupPreviousMessage = async (ctx: any, userId: number) => {
  const user = getUser(userId);
  if (user && user.last_message_id) {
    try {
      await ctx.telegram.deleteMessage(userId, user.last_message_id);
    } catch (e) {
      // Message might be too old to delete or already deleted
      console.log('Could not delete previous message', e);
    }
  }
};

// Helper to send welcome message
const sendWelcomeMessage = async (ctx: any, userId: number, firstName: string | null) => {
  const user = getUser(userId);
  if (!user) return;

  const now = new Date();
  let statusText = '';
  let trialStarted = user.trial_started_at !== null;
  let hasSubscription = false;
  let isTrialActive = false;
  let expiryDate: Date | null = null;

  if (user.subscription_expires_at) {
    expiryDate = new Date(user.subscription_expires_at);
    if (now < expiryDate) {
      hasSubscription = true;
    }
  }

  if (!hasSubscription && user.trial_started_at) {
    const trialStart = new Date(user.trial_started_at);
    expiryDate = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    if (now < expiryDate) {
      isTrialActive = true;
    }
  }

  let welcomeMessage = `
Привет, ${firstName || 'друг'}! 🧘‍♂️

Добро пожаловать в **Dzen VPN** — твой спокойный и безопасный интернет.
  `;

  const buttons: any[][] = [];

  if (hasSubscription) {
    welcomeMessage += `\n✅ **Подписка активна!**\n📅 Действует до: ${expiryDate?.toLocaleDateString('ru-RU')}`;
    buttons.push([Markup.button.callback('🚀 Получить конфигурацию', 'get_config')]);
  } else if (isTrialActive) {
    welcomeMessage += `\n🎁 **Пробный период активен!**\n📅 Истекает: ${expiryDate?.toLocaleDateString('ru-RU')}`;
    buttons.push([Markup.button.callback('🚀 Получить конфигурацию', 'get_config')]);
  } else if (!trialStarted) {
    welcomeMessage += `\n🎁 Вам доступен **пробный период на 3 дня**. Нажмите кнопку ниже, чтобы активировать его.`;
    buttons.push([Markup.button.callback('🎁 Активировать пробный период', 'start_trial')]);
  } else {
    welcomeMessage += `\n❌ Ваша подписка или пробный период истекли.`;
  }

  buttons.push([Markup.button.callback('💳 Оплатить подписку', 'pay_sub')]);

  const sentMessage = await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });

  updateLastMessageId(userId, sentMessage.message_id);
};

// Start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || null;

  createUser(userId, username, firstName);
  await cleanupPreviousMessage(ctx, userId);

  // Explicitly remove the Web App menu button by setting it to default
  try {
    await ctx.setChatMenuButton({ type: 'default' });
  } catch (e) {
    console.error('Failed to reset menu button', e);
  }

  await sendWelcomeMessage(ctx, userId, firstName);
});

// Back to main menu action
bot.action('main_menu', async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || null;
  await cleanupPreviousMessage(ctx, userId);
  await sendWelcomeMessage(ctx, userId, firstName);
  await ctx.answerCbQuery();
});

// Start trial action
bot.action('start_trial', async (ctx) => {
  const userId = ctx.from.id;
  const user = getUser(userId);
  
  if (user && user.trial_started_at === null) {
    startTrial(userId);
    await ctx.answerCbQuery('✅ Пробный период на 3 дня активирован!', { show_alert: true });
    await cleanupPreviousMessage(ctx, userId);
    await sendWelcomeMessage(ctx, userId, ctx.from.first_name || null);
  } else {
    await ctx.answerCbQuery('❌ Вы уже использовали пробный период.', { show_alert: true });
  }
});

// Callback query for getting config
bot.action('get_config', async (ctx) => {
  const userId = ctx.from.id;
  await cleanupPreviousMessage(ctx, userId);

  const user = getUser(userId);
  if (!user) return;

  if (hasAccess(userId)) {
    // Check if user already has a config
    if (user.vpn_config) {
      const configMessage = `
🚀 **Ваша конфигурация готова!**

Скопируйте ссылку ниже и вставьте её в приложение (например, V2RayNG или Nekobox):

\`${user.vpn_config}\`

🧘‍♂️ Приятного использования!
      `;
      const sentMessage = await ctx.reply(configMessage, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Назад', 'main_menu')]
        ])
      });
      updateLastMessageId(userId, sentMessage.message_id);
      return await ctx.answerCbQuery();
    }

    // Generate new config
    try {
      await ctx.answerCbQuery('⏳ Генерируем ваш личный ключ...', { show_alert: false });
      
      let expiryTime = 0;
      if (user.subscription_expires_at) {
        expiryTime = new Date(user.subscription_expires_at).getTime();
      } else if (user.trial_started_at) {
        const trialStart = new Date(user.trial_started_at);
        expiryTime = trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
      }

      const vpnData = await createVpnClient(userId, user.username || `user_${userId}`, expiryTime);
      updateVpnConfig(userId, vpnData.email, vpnData.config);

      const configMessage = `
🚀 **Ваш личный ключ создан!**

Скопируйте ссылку ниже и добавьте её в VPN-клиент:

\`${vpnData.config}\`

📖 **Как пользоваться?**
1. Скачайте **V2RayNG** (Android) или **Nekobox** / **V2Box** (iOS).
2. Скопируйте ключ выше.
3. В приложении нажмите "+" -> "Import from Clipboard".
4. Нажмите на появившийся профиль и кнопку подключения.

🧘‍♂️ Приятного использования!
      `;
      const sentMessage = await ctx.reply(configMessage, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Назад', 'main_menu')]
        ])
      });
      updateLastMessageId(userId, sentMessage.message_id);
    } catch (error) {
      console.error('VPN Creation error:', error);
      const sentMessage = await ctx.reply('❌ Произошла ошибка при создании ключа. Пожалуйста, попробуйте позже или обратитесь в поддержку.', Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Назад', 'main_menu')]
      ]));
      updateLastMessageId(userId, sentMessage.message_id);
    }
  } else {
    await ctx.answerCbQuery('❌ Пробный период или подписка истекли.', { show_alert: true });
    const sentMessage = await ctx.reply('Твой пробный период или подписка закончились. Пожалуйста, оплати подписку.', Markup.inlineKeyboard([
      [Markup.button.callback('💳 Оплатить подписку', 'pay_sub')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ]));
    updateLastMessageId(userId, sentMessage.message_id);
  }
});

// Callback query for payment plan selection
bot.action('pay_sub', async (ctx) => {
  const userId = ctx.from.id;
  await cleanupPreviousMessage(ctx, userId);

  const plansMessage = `
💳 **Выберите тарифный план**

Выберите подходящий период подписки. Чем дольше период, тем выгоднее!

🔹 **1 месяц** — 100 ⭐
🔹 **3 месяца** — 250 ⭐ (Экономия 50 ⭐)
🔹 **1 год** — 800 ⭐ (Экономия 400 ⭐)
  `;

  const sentMessage = await ctx.reply(plansMessage, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('💎 1 месяц — 100 ⭐', 'pay_plan_1')],
      [Markup.button.callback('🔥 3 месяца — 250 ⭐', 'pay_plan_3')],
      [Markup.button.callback('👑 1 год — 800 ⭐', 'pay_plan_12')],
      [Markup.button.callback('⬅️ Назад', 'main_menu')]
    ])
  });

  updateLastMessageId(userId, sentMessage.message_id);
  await ctx.answerCbQuery();
});

// Helper to send invoice for a specific plan
const sendPlanInvoice = async (ctx: any, months: number, price: number) => {
  const userId = ctx.from.id;
  await cleanupPreviousMessage(ctx, userId);

  const title = months === 12 ? 'Подписка на 1 год' : `Подписка на ${months} ${months === 1 ? 'месяц' : 'месяца'}`;
  const description = `Безлимитный доступ к Dzen VPN на ${months * 30} дней.`;
  
  const invoice = {
    title,
    description,
    payload: `sub_${months}_month_${userId}`,
    provider_token: '', // Empty for Telegram Stars
    currency: 'XTR',
    prices: [{ label: title, amount: price }],
  };

  try {
    const sentMessage = await ctx.replyWithInvoice(invoice, Markup.inlineKeyboard([
      [Markup.button.pay('💳 Оплатить')],
      [Markup.button.callback('⬅️ Назад к тарифам', 'pay_sub')]
    ]));
    updateLastMessageId(userId, sentMessage.message_id);
    await ctx.answerCbQuery();
  } catch (error: any) {
    console.error(`Error sending invoice for ${months} months:`, error);
    let errorMessage = '❌ Ошибка при создании платежа.';
    if (error.description) {
      errorMessage += `\n\nПричина: ${error.description}\n\n💡 Убедитесь, что вы включили платежи в @BotFather.`;
    }
    const sentMessage = await ctx.reply(errorMessage, Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Назад к тарифам', 'pay_sub')]
    ]));
    updateLastMessageId(userId, sentMessage.message_id);
    await ctx.answerCbQuery();
  }
};

bot.action('pay_plan_1', (ctx) => sendPlanInvoice(ctx, 1, 100));
bot.action('pay_plan_3', (ctx) => sendPlanInvoice(ctx, 3, 250));
bot.action('pay_plan_12', (ctx) => sendPlanInvoice(ctx, 12, 800));

// Admin command
bot.command('admin', async (ctx) => {
  const userId = ctx.from.id;
  
  // If ADMIN_ID is not set, help the user set it up
  if (!ADMIN_ID) {
    return ctx.reply(`⚙️ **Настройка админ-панели**\n\nПеременная \`ADMIN_ID\` не установлена в настройках сервера.\n\nЧтобы получить доступ, добавьте ваш ID в переменные окружения:\n\`ADMIN_ID\` = \`${userId}\`\n\nПосле этого перезапустите бота.`, { parse_mode: 'Markdown' });
  }

  // Strict check if ADMIN_ID is set
  if (userId !== ADMIN_ID) {
    console.warn(`Unauthorized admin access attempt by ${userId}`);
    return; // Silent return for unauthorized users
  }

  const stats = getStats();
  const adminMsg = `
📊 **Панель администратора Dzen VPN**

👥 **Пользователи:**
— Всего: ${stats.total}
— Активных подписок: ${stats.active_subs}
— На пробном периоде: ${stats.active_trials}
— Истекших: ${stats.expired}

💰 **Финансы:**
— Оплат за сегодня: ${stats.payments_today}
— Оплат за месяц: ${stats.payments_month}

Вы можете запросить полный список пользователей в формате документа.
  `;

  await ctx.reply(adminMsg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📄 Выгрузить список (CSV)', 'admin_export')],
      [Markup.button.callback('🔄 Обновить статистику', 'admin_refresh')]
    ])
  });
});

bot.action('admin_refresh', async (ctx) => {
  const userId = ctx.from.id;
  if (!ADMIN_ID || userId !== ADMIN_ID) return ctx.answerCbQuery();
  
  const stats = getStats();
  const adminMsg = `
📊 **Панель администратора Dzen VPN**

👥 **Пользователи:**
— Всего: ${stats.total}
— Активных подписок: ${stats.active_subs}
— На пробном периоде: ${stats.active_trials}
— Истекших: ${stats.expired}

💰 **Финансы:**
— Оплат за сегодня: ${stats.payments_today}
— Оплат за месяц: ${stats.payments_month}
  `;

  try {
    await ctx.editMessageText(adminMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📄 Выгрузить список (CSV)', 'admin_export')],
        [Markup.button.callback('🔄 Обновить статистику', 'admin_refresh')]
      ])
    });
  } catch (e) {}
  await ctx.answerCbQuery('Статистика обновлена');
});

bot.action('admin_export', async (ctx) => {
  const userId = ctx.from.id;
  if (!ADMIN_ID || userId !== ADMIN_ID) return ctx.answerCbQuery();

  const users = getAllUsers();
  // Detailed CSV headers
  let csv = 'ID,Username,FirstName,JoinedAt,TrialActivatedAt,LastSubDuration(Months),SubscriptionExpiresAt\n';
  
  users.forEach(u => {
    const joined = u.created_at ? new Date(u.created_at).toLocaleString('ru-RU') : '';
    const trial = u.trial_started_at ? new Date(u.trial_started_at).toLocaleString('ru-RU') : 'Не активирован';
    const subExpires = u.subscription_expires_at ? new Date(u.subscription_expires_at).toLocaleString('ru-RU') : 'Нет подписки';
    const subMonths = u.last_sub_months || 0;
    
    csv += `${u.id},${u.username || ''},${u.first_name || ''},"${joined}","${trial}",${subMonths},"${subExpires}"\n`;
  });

  const buffer = Buffer.from(csv, 'utf-8');
  await ctx.replyWithDocument({ source: buffer, filename: `users_report_${new Date().toISOString().split('T')[0]}.csv` }, {
    caption: `📊 **Детальный отчет о пользователях**\n\n📅 Дата: ${new Date().toLocaleDateString('ru-RU')}\n👥 Всего: ${users.length}`,
    parse_mode: 'Markdown'
  });
  await ctx.answerCbQuery();
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
  
  if (payment && payment.invoice_payload.includes('_month_')) {
    const payloadParts = payment.invoice_payload.split('_');
    const months = parseInt(payloadParts[1]) || 1;
    const user = getUser(userId);
    if (!user) return;

    let startDate = new Date();
    
    // 1. Check if there's an active subscription
    if (user.subscription_expires_at) {
      const currentExpiry = new Date(user.subscription_expires_at);
      if (currentExpiry > startDate) {
        startDate = currentExpiry;
      }
    } 
    // 2. If no active sub, check if user is still on trial
    else if (user.trial_started_at) {
      const trialStart = new Date(user.trial_started_at);
      const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      if (new Date() < trialEnd) {
        startDate = trialEnd;
      }
    }
    
    const newExpiry = new Date(startDate);
    newExpiry.setDate(newExpiry.getDate() + (months * 30));
    updateSubscription(userId, newExpiry.toISOString(), months);

    const durationText = months === 12 ? '1 год' : `${months} ${months === 1 ? 'месяц' : 'месяца'}`;
    await ctx.reply(`✅ Оплата успешно получена! Ваша подписка продлена на ${durationText}.\nТеперь она действует до: ${newExpiry.toLocaleDateString('ru-RU')}\nНажмите /start чтобы получить конфигурацию.`);

    // Notify Admin
    if (ADMIN_ID) {
      try {
        const stats = getStats();
        const adminMsg = `
💰 **Новая оплата!**
👤 Пользователь: ${ctx.from.first_name} (@${ctx.from.username || 'нет'})
📅 Тариф: ${durationText}
💵 Сумма: ${payment.total_amount / 1} ⭐

📊 **Текущая статистика:**
👥 Всего пользователей: ${stats.total}
💳 Активных подписок: ${stats.active_subs}
🎁 На пробном периоде: ${stats.active_trials}
⌛ Истекших: ${stats.expired}
        `;
        await bot.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error('Failed to notify admin about payment:', e);
      }
    }
  }
});

// Handle Web App data
bot.on('web_app_data', async (ctx) => {
  try {
    // @ts-ignore
    const data = JSON.parse(ctx.message?.web_app_data?.data || '{}');
    const userId = ctx.from.id;
    await cleanupPreviousMessage(ctx, userId);
    
    if (data.action === 'get_config') {
      // Simulate clicking the "get_config" button
      await ctx.reply('Обработка запроса конфигурации...');
      // We can't directly call the action handler, so we just send the same message
      if (hasAccess(userId)) {
        const configMessage = `
🛠 **Конфигурации скоро будут доступны!**

В данный момент идут технические работы по настройке серверов. 
Пожалуйста, подождите немного, мы сообщим, когда всё будет готово.
        `;
        const sentMessage = await ctx.reply(configMessage, { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Оплатить подписку', 'pay_sub')],
            [Markup.button.callback('⬅️ Назад', 'main_menu')]
          ])
        });
        updateLastMessageId(userId, sentMessage.message_id);
      } else {
        const sentMessage = await ctx.reply('Твой пробный период или подписка закончились. Пожалуйста, оплати подписку.', Markup.inlineKeyboard([
          [Markup.button.callback('💳 Оплатить подписку', 'pay_sub')],
          [Markup.button.callback('⬅️ Назад', 'main_menu')]
        ]));
        updateLastMessageId(userId, sentMessage.message_id);
      }
    } else if (data.action === 'pay_sub') {
      // Show plan selection menu instead of direct invoice
      const plansMessage = `
💳 **Выберите тарифный план**

Выберите подходящий период подписки. Чем дольше период, тем выгоднее!

🔹 **1 месяц** — 100 ⭐
🔹 **3 месяца** — 250 ⭐ (Экономия 50 ⭐)
🔹 **1 год** — 800 ⭐ (Экономия 400 ⭐)
      `;

      const sentMessage = await ctx.reply(plansMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💎 1 месяц — 100 ⭐', 'pay_plan_1')],
          [Markup.button.callback('🔥 3 месяца — 250 ⭐', 'pay_plan_3')],
          [Markup.button.callback('👑 1 год — 800 ⭐', 'pay_plan_12')],
          [Markup.button.callback('⬅️ Назад', 'main_menu')]
        ])
      });
      updateLastMessageId(userId, sentMessage.message_id);
    }
  } catch (e) {
    console.error('Error handling web app data:', e);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// Expiration check background task
const checkExpirations = async () => {
  try {
    const expiredUsers = getExpiredUsers();
    for (const user of expiredUsers) {
      try {
        await bot.telegram.sendMessage(user.id, `⚠️ **Внимание!** Ваша подписка на Dzen VPN истекла.\n\nЧтобы продолжить пользоваться безопасным интернетом, пожалуйста, продлите подписку.`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Продлить подписку', 'pay_sub')],
            [Markup.button.callback('🏠 В главное меню', 'main_menu')]
          ])
        });
        setExpiryNotified(user.id, true);
        console.log(`Notified user ${user.id} about expiration`);
      } catch (e) {
        console.error(`Failed to notify user ${user.id}:`, e);
        // If we can't send message (bot blocked), we still mark as notified to stop trying
        setExpiryNotified(user.id, true);
      }
    }
  } catch (e) {
    console.error('Error in checkExpirations task:', e);
  }
};

// Run check every 10 minutes
setInterval(checkExpirations, 10 * 60 * 1000);
// Run once on startup
setTimeout(checkExpirations, 5000);
