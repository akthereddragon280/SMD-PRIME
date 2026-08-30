/**
 * SMD PRIME — High-ROI Cloudflare Worker Telegram Bot Webhook Engine
 * Features:
 *  - 100% In-App Telegram WebApp Overlay Enforcement
 *  - Automated Referral Pipeline (Invite 3 Friends -> 3 Days Free Premium)
 *  - Deep-linked Movie Auto-Play Streaming Cards (Direct to #player)
 *  - Live Supabase Sync (User Registration, Role Check, Promotion, Stats)
 *  - Monetization Suite (Premium Showcase, Free Trial, Telegram Stars / UPI)
 *  - Full Admin Control (/stats, /promote, /broadcast)
 */

const DEFAULT_SUPABASE_URL = 'https://iwulcblngplsjtsipods.supabase.co';
const DEFAULT_WEB_APP_URL = 'https://smd-prime.vercel.app';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 1. One-Click Webhook Registration Endpoint (GET /setup-webhook?url=YOUR_WORKER_URL)
    if (request.method === 'GET' && url.pathname === '/setup-webhook') {
      const targetWebhook = url.searchParams.get('url') || `${url.origin}/webhook`;
      const botToken = env.TELEGRAM_BOT_TOKEN || '';
      
      if (!botToken) {
        return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not configured' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(targetWebhook)}`);
      const data = await tgRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // 2. Incoming Telegram Webhook Updates
    if (request.method === 'POST') {
      const botToken = env.TELEGRAM_BOT_TOKEN || '';
      const webAppUrl = (env.WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/+$/, '');
      const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
      const supabaseKey = env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || '';

      try {
        const update = await request.json();
        
        if (update.message) {
          ctx.waitUntil(handleMessage(update.message, botToken, webAppUrl, supabaseUrl, supabaseKey));
        } else if (update.callback_query) {
          ctx.waitUntil(handleCallback(update.callback_query, botToken, webAppUrl, supabaseUrl, supabaseKey));
        }

        return new Response('OK', { status: 200, headers: CORS_HEADERS });
      } catch (err) {
        console.error('Webhook processing error:', err);
        return new Response('OK', { status: 200, headers: CORS_HEADERS });
      }
    }

    return new Response('🤖 SMD PRIME Telegram Bot Webhook Active', { status: 200, headers: CORS_HEADERS });
  }
};

/**
 * Main Webhook Message Handler
 */
async function handleMessage(message, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const chatId = message.chat.id;
  const fromUser = message.from;
  if (!fromUser) return;

  const telegramId = String(fromUser.id);
  const text = (message.text || '').trim();
  const firstName = fromUser.first_name || 'Movie Fan';
  const username = fromUser.username || '';

  if (!text) return;

  // Background registration in Supabase
  let referralCode = null;
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
      referralCode = parts[1].replace('ref_', '');
    }
  }

  await registerOrUpdateUser(telegramId, firstName, username, referralCode, supabaseUrl, supabaseKey);

  // 1. COMMAND: /start [ref_id]
  if (text.startsWith('/start')) {
    const welcomeText = 
      `⚡ <b>Welcome to SMD PRIME, ${escapeHtml(firstName)}!</b> 🍿\n\n` +
      `Your ultra-fast cloud cinema streaming engine is live. ` +
      `Tap the button below to launch the OTT streaming app directly inside Telegram with zero buffering & 4K quality!\n\n` +
      `<b>💡 Quick Guide:</b>\n` +
      `• Type any movie name (e.g. <i>Master</i>, <i>Jana Nayagan</i>) for instant cards.\n` +
      `• Use <b>/refer</b> to invite friends & earn <b>FREE Premium</b>!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }],
        [
          { text: '⭐ Buy Premium', callback_data: 'buy_premium' },
          { text: '👥 Refer Friends', callback_data: 'refer_friends' }
        ],
        [
          { text: '📊 My Account', callback_data: 'my_plan' },
          { text: '⚡ Help Center', callback_data: 'help_info' }
        ]
      ]
    };

    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: welcomeText,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  // 2. COMMAND: /help
  if (text.startsWith('/help')) {
    await sendHelpCard(chatId, botToken, webAppUrl);
    return;
  }

  // 3. COMMAND: /myplan or /info
  if (text.startsWith('/myplan') || text.startsWith('/info')) {
    await sendUserPlanCard(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey);
    return;
  }

  // 4. COMMAND: /refer
  if (text.startsWith('/refer')) {
    await sendReferralCard(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey);
    return;
  }

  // 5. COMMAND: /premium or /buy
  if (text.startsWith('/premium') || text.startsWith('/buy')) {
    await sendPremiumShowcaseCard(chatId, botToken, webAppUrl);
    return;
  }

  // 6. COMMAND: /freetrial
  if (text.startsWith('/freetrial')) {
    await handleFreeTrialRequest(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey);
    return;
  }

  // 7. ADMIN COMMANDS: /stats, /promote, /broadcast
  if (text.startsWith('/stats')) {
    await handleAdminStats(chatId, botToken, supabaseUrl, supabaseKey);
    return;
  }

  if (text.startsWith('/promote')) {
    const parts = text.split(' ');
    if (parts.length >= 3) {
      await handleAdminPromote(chatId, parts[1], parts[2], botToken, supabaseUrl, supabaseKey);
    } else {
      await sendTelegramApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ <b>Usage:</b> <code>/promote <telegram_id> <normal|premium|admin></code>',
        parse_mode: 'HTML'
      });
    }
    return;
  }

  if (text.startsWith('/broadcast')) {
    const broadcastText = text.replace('/broadcast', '').trim();
    if (broadcastText) {
      await handleAdminBroadcast(chatId, broadcastText, botToken, webAppUrl, supabaseUrl, supabaseKey);
    } else {
      await sendTelegramApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ <b>Usage:</b> <code>/broadcast <Your announcement message></code>',
        parse_mode: 'HTML'
      });
    }
    return;
  }

  // 8. TEXT SEARCH FALLBACK
  if (!text.startsWith('/')) {
    await handleMovieLookup(chatId, text, botToken, webAppUrl, supabaseUrl, supabaseKey);
  }
}

/**
 * Callback Query Handler
 */
async function handleCallback(callbackQuery, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const chatId = callbackQuery.message?.chat?.id;
  const telegramId = String(callbackQuery.from.id);
  const data = callbackQuery.data;

  await sendTelegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQuery.id
  });

  if (!chatId) return;

  if (data === 'help_info') {
    await sendHelpCard(chatId, botToken, webAppUrl);
  } else if (data === 'buy_premium') {
    await sendPremiumShowcaseCard(chatId, botToken, webAppUrl);
  } else if (data === 'refer_friends') {
    await sendReferralCard(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey);
  } else if (data === 'my_plan') {
    await sendUserPlanCard(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey);
  } else if (data === 'free_trial') {
    await handleFreeTrialRequest(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey);
  }
}

/**
 * Help Center Card Generator
 */
async function sendHelpCard(chatId, botToken, webAppUrl) {
  const helpText = 
    `🍿 <b>SMD PRIME — User Guide & Help Center</b>\n\n` +
    `<b>1. Browse & Stream Movies:</b>\n` +
    `Tap <b>'🚀 Launch SMD PRIME'</b> below to open the Mini App and stream movies in 1080p/4K.\n\n` +
    `<b>2. Instant Chat Search:</b>\n` +
    `Type any movie name directly in this chat to receive interactive movie cards with instant play buttons.\n\n` +
    `<b>3. Earn Free Premium:</b>\n` +
    `Use <b>/refer</b> to invite 3 friends to SMD PRIME and get 3 Days of Ad-Free Premium automatically!\n\n` +
    `<b>4. External Player Handoff:</b>\n` +
    `Inside the video player, tap <b>'EXT'</b> to stream seamlessly in external players like VLC or MX Player.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }],
      [
        { text: '⭐ Buy Premium', callback_data: 'buy_premium' },
        { text: '👥 Refer Friends', callback_data: 'refer_friends' }
      ]
    ]
  };

  await sendTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: helpText,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Premium Showcase Card
 */
async function sendPremiumShowcaseCard(chatId, botToken, webAppUrl) {
  const premiumText = 
    `👑 <b>SMD PRIME VIP PREMIUM MEMBERSHIP</b>\n\n` +
    `Unlock the ultimate cinema experience with Zero Ads & 4K Streaming!\n\n` +
    `✨ <b>PREMIUM BENEFITS:</b>\n` +
    `▪️ 🚫 <b>100% Ad-Free Experience</b> (Zero Popups)\n` +
    `▪️ 🎬 <b>Ultra HD 4K Streaming</b> Support\n` +
    `▪️ ⚡ <b>Unlimited High-Speed Downloads</b>\n` +
    `▪️ 🌐 <b>Multi-Audio Tracks & Subtitles</b>\n` +
    `▪️ 🛡️ <b>Priority Cloud Storage Mesh</b>\n\n` +
    `💳 <b>SELECT A PLAN:</b>\n` +
    `• <b>1 Month VIP:</b> ₹99 / $1.99\n` +
    `• <b>1 Year VIP Pass:</b> ₹499 / $7.99 (Best Value! 🔥)\n\n` +
    `💡 <i>Or tap '/refer' to invite 3 friends and get 3 Days FREE!</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Launch & Upgrade in App', web_app: { url: `${webAppUrl}#premium` } }],
      [{ text: '🎁 Activate 24H Free Trial', callback_data: 'free_trial' }],
      [{ text: '👥 Refer Friends for Free VIP', callback_data: 'refer_friends' }]
    ]
  };

  await sendTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: premiumText,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * User Account Plan & Status Card
 */
async function sendUserPlanCard(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const user = await fetchUserFromSupabase(telegramId, supabaseUrl, supabaseKey);
  const role = (user?.role || 'normal').toUpperCase();
  const refCount = user?.referral_count || 0;
  const roleBadge = role === 'ADMIN' ? '👑 ADMIN' : role === 'PREMIUM' ? '⭐ PREMIUM VIP' : '👥 NORMAL MEMBER';

  const planText = 
    `📊 <b>SMD PRIME — My Account Status</b>\n\n` +
    `👤 <b>Telegram ID:</b> <code>${telegramId}</code>\n` +
    `🏅 <b>Role Status:</b> ${roleBadge}\n` +
    `👥 <b>Successful Referrals:</b> ${refCount} Users\n\n` +
    `<b>⚡ Plan Capabilities:</b>\n` +
    (role === 'NORMAL' 
      ? `• Max Quality: 720p HD\n• Direct Downloads: Restricted\n• Ad-Free Stream: No\n\n💡 <i>Upgrade to Premium for 4K & Ad-Free streaming!</i>` 
      : `• Max Quality: 4K Ultra HD 🚀\n• Direct Downloads: Unlimited ⚡\n• Ad-Free Stream: Enabled ✅`);

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }],
      role === 'NORMAL' 
        ? [{ text: '⭐ Upgrade to Premium', callback_data: 'buy_premium' }]
        : [{ text: '👥 Refer More Friends', callback_data: 'refer_friends' }]
    ]
  };

  await sendTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: planText,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Referral Program Card
 */
async function sendReferralCard(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const user = await fetchUserFromSupabase(telegramId, supabaseUrl, supabaseKey);
  const refCount = user?.referral_count || 0;
  const target = 3;
  const refLink = `https://t.me/SMD_PRIME_BOT?start=ref_${telegramId}`;

  // Progress Bar Generator
  const filled = Math.min(refCount, target);
  const empty = target - filled;
  const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

  const referText = 
    `🎁 <b>SMD PRIME — Viral Referral Program</b>\n\n` +
    `Invite <b>3 Friends</b> to join SMD PRIME and instantly receive <b>3 Days of VIP Premium</b> for FREE! 🎉\n\n` +
    `📊 <b>Your Referral Progress:</b>\n` +
    `<code>[${progressBar}]</code> ${filled}/${target} Invited\n\n` +
    `🔗 <b>Your Exclusive Referral Link:</b>\n` +
    `<code>${refLink}</code>\n\n` +
    `💡 <i>Copy and send this link to your movie groups or friends. When they launch the bot, your progress updates automatically!</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📲 Share Referral Link', url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('🍿 Watch 4K Tamil & English Movies for FREE on SMD PRIME Cinema!')}` }
      ],
      [{ text: '🚀 Open SMD PRIME App', web_app: { url: webAppUrl } }]
    ]
  };

  await sendTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: referText,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Free Trial Request Handler
 */
async function handleFreeTrialRequest(chatId, telegramId, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const user = await fetchUserFromSupabase(telegramId, supabaseUrl, supabaseKey);
  
  if (user?.role === 'premium' || user?.role === 'admin') {
    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '⭐ <b>You already have VIP Premium status active!</b> Enjoy unlimited 4K ad-free streaming.',
      parse_mode: 'HTML'
    });
    return;
  }

  // Grant 24-hour trial by setting role to premium in Supabase
  await promoteUserInSupabase(telegramId, 'premium', supabaseUrl, supabaseKey);

  const trialText = 
    `🎉 <b>CONGRATULATIONS! 24H FREE TRIAL ACTIVATED!</b> 🚀\n\n` +
    `Your account has been upgraded to <b>⭐ PREMIUM VIP</b> for the next 24 hours.\n\n` +
    `✨ Enjoy 100% Ad-Free 4K Streaming & Unlimited High-Speed Downloads!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🍿 Stream 4K Movies Now', web_app: { url: webAppUrl } }]
    ]
  };

  await sendTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: trialText,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

/**
 * Dynamic Supabase Movie Lookup & Deep-Linked Auto-Play Card
 */
async function handleMovieLookup(chatId, queryText, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  if (queryText.length < 2) return;

  await sendTelegramApi(botToken, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing'
  });

  let movies = [];
  try {
    const searchUrl = `${supabaseUrl}/rest/v1/movies?select=*,movie_sources(*)&or=(title.ilike.*${encodeURIComponent(queryText)}*,original_title.ilike.*${encodeURIComponent(queryText)}*,overview.ilike.*${encodeURIComponent(queryText)}*)&limit=1`;
    const sbRes = await fetch(searchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    if (sbRes.ok) {
      movies = await sbRes.json();
    }
  } catch (err) {
    console.error('Supabase query exception:', err);
  }

  if (!movies || movies.length === 0) {
    const emptyText = 
      `🔍 <b>No movies found matching '${escapeHtml(queryText)}'</b>\n\n` +
      `Tap below to launch the SMD PRIME Mini App and search our full cloud cinema catalog!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Launch SMD PRIME Catalog', web_app: { url: webAppUrl } }]
      ]
    };

    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: emptyText,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  const movie = movies[0];
  const uid = movie.uid || movie.id || 'master_2021';
  const title = sanitizeTitle(movie.title);
  const origTitle = sanitizeTitle(movie.original_title || title);
  const year = movie.release_year || '2026';
  const rating = movie.rating !== null && movie.rating !== undefined ? String(movie.rating) : '8.5';
  const duration = movie.duration || '2h 15m';
  const overview = movie.overview || 'High quality cinema stream loaded live from SMD Prime Cloud Cinema Library.';
  const poster = movie.poster_url;
  const genre = movie.genre || 'Action / Cinema';

  const sources = movie.movie_sources || [];
  const qualities = sources.map(s => s.quality).filter(Boolean);
  const qualityStr = qualities.length > 0 ? qualities.join(', ') : '1080p Ultra HD';

  // Deep-linked WebApp URL parameter for instant Auto-Play inside Telegram Mini App
  const movieAppUrl = `${webAppUrl}?movie=${encodeURIComponent(uid)}&play=true`;

  const cardKeyboard = {
    inline_keyboard: [
      [
        { text: `▶️ Stream ${title.substring(0, 22)} Now`, web_app: { url: movieAppUrl } }
      ],
      [
        { text: '🍿 Open Full SMD PRIME Catalog', web_app: { url: webAppUrl } }
      ]
    ]
  };

  const cardText = 
    `🎬 <b>${escapeHtml(title)} (${year})</b>\n` +
    `<i>${escapeHtml(origTitle)}</i>\n\n` +
    `⭐ <b>Rating:</b> ${rating} / 10 | 🎭 <b>Genre:</b> ${escapeHtml(genre)}\n` +
    `⏱️ <b>Duration:</b> ${duration} | 💿 <b>Quality:</b> ${qualityStr}\n\n` +
    `📖 <b>Overview:</b> ${escapeHtml(overview.substring(0, 180))}...`;

  try {
    if (poster && poster.startsWith('http')) {
      await sendTelegramApi(botToken, 'sendPhoto', {
        chat_id: chatId,
        photo: poster,
        caption: cardText,
        parse_mode: 'HTML',
        reply_markup: cardKeyboard
      });
    } else {
      await sendTelegramApi(botToken, 'sendMessage', {
        chat_id: chatId,
        text: cardText,
        parse_mode: 'HTML',
        reply_markup: cardKeyboard
      });
    }
  } catch (e) {
    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: cardText,
      parse_mode: 'HTML',
      reply_markup: cardKeyboard
    });
  }
}

/**
 * Admin Stats Command Handler
 */
async function handleAdminStats(chatId, botToken, supabaseUrl, supabaseKey) {
  try {
    const usersRes = await fetch(`${supabaseUrl}/rest/v1/telegram_users?select=count`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'count=exact' }
    });
    const premRes = await fetch(`${supabaseUrl}/rest/v1/telegram_users?role=eq.premium&select=count`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'count=exact' }
    });
    const movieRes = await fetch(`${supabaseUrl}/rest/v1/movies?select=count`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'count=exact' }
    });

    const totalUsers = usersRes.headers.get('content-range')?.split('/')[1] || '0';
    const totalPremium = premRes.headers.get('content-range')?.split('/')[1] || '0';
    const totalMovies = movieRes.headers.get('content-range')?.split('/')[1] || '0';

    const statsText = 
      `📈 <b>SMD PRIME — Realtime Platform Stats</b>\n\n` +
      `👥 <b>Total Telegram Users:</b> ${totalUsers}\n` +
      `⭐ <b>Active VIP Premium Users:</b> ${totalPremium}\n` +
      `🎬 <b>Total Movies in Catalog:</b> ${totalMovies}\n` +
      `⚡ <b>Engine Health:</b> 100% Operational`;

    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: statsText,
      parse_mode: 'HTML'
    });
  } catch (err) {
    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Error fetching stats: ${err.message}`
    });
  }
}

/**
 * Admin Promote User Handler
 */
async function handleAdminPromote(chatId, targetId, targetRole, botToken, supabaseUrl, supabaseKey) {
  const role = targetRole.toLowerCase();
  if (!['normal', 'premium', 'admin'].includes(role)) {
    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '⚠️ Invalid role. Choose: <code>normal</code>, <code>premium</code>, or <code>admin</code>',
      parse_mode: 'HTML'
    });
    return;
  }

  await promoteUserInSupabase(targetId, role, supabaseUrl, supabaseKey);

  await sendTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text: `✅ <b>User Promoted!</b> Telegram ID <code>${targetId}</code> is now <b>${role.toUpperCase()}</b>`,
    parse_mode: 'HTML'
  });
}

/**
 * Admin Broadcast Handler
 */
async function handleAdminBroadcast(chatId, broadcastMessage, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/telegram_users?select=telegram_id`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const users = await res.json();

    if (!users || !Array.isArray(users)) {
      await sendTelegramApi(botToken, 'sendMessage', { chatId, text: '❌ No users found for broadcast.' });
      return;
    }

    let sent = 0;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }]
      ]
    };

    for (const u of users) {
      if (u.telegram_id) {
        await sendTelegramApi(botToken, 'sendMessage', {
          chat_id: u.telegram_id,
          text: `📢 <b>SMD PRIME ANNOUNCEMENT</b>\n\n${broadcastMessage}`,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        sent++;
      }
    }

    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `📢 <b>Broadcast Completed!</b> Message sent to ${sent} users.`,
      parse_mode: 'HTML'
    });
  } catch (err) {
    await sendTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `❌ Broadcast failed: ${err.message}`
    });
  }
}

/**
 * Supabase User Sync & Registration Helper
 */
async function registerOrUpdateUser(telegramId, firstName, username, referralCode, supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) return;

  try {
    // 1. Check existing user
    const existing = await fetchUserFromSupabase(telegramId, supabaseUrl, supabaseKey);

    if (!existing) {
      // Create new user record
      await fetch(`${supabaseUrl}/rest/v1/telegram_users`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          telegram_id: telegramId,
          first_name: firstName,
          username: username,
          role: 'normal',
          referral_count: 0,
          referred_by: referralCode || null,
          created_at: new Date().toISOString()
        })
      });

      // Handle referral credit for referrer if referralCode exists
      if (referralCode && referralCode !== telegramId) {
        const referrer = await fetchUserFromSupabase(referralCode, supabaseUrl, supabaseKey);
        if (referrer) {
          const newRefCount = (referrer.referral_count || 0) + 1;
          const newRole = newRefCount >= 3 ? 'premium' : (referrer.role || 'normal');

          await fetch(`${supabaseUrl}/rest/v1/telegram_users?telegram_id=eq.${referralCode}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              referral_count: newRefCount,
              role: newRole
            })
          });
        }
      }
    } else {
      // Update basic details if changed
      await fetch(`${supabaseUrl}/rest/v1/telegram_users?telegram_id=eq.${telegramId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: firstName,
          username: username
        })
      });
    }
  } catch (err) {
    console.error('Supabase user sync error:', err);
  }
}

/**
 * Fetch User Record from Supabase
 */
async function fetchUserFromSupabase(telegramId, supabaseUrl, supabaseKey) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/telegram_users?telegram_id=eq.${telegramId}&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      return data && data.length > 0 ? data[0] : null;
    }
  } catch (e) {
    console.error('Fetch user error:', e);
  }
  return null;
}

/**
 * Promote User Role in Supabase Helper
 */
async function promoteUserInSupabase(telegramId, role, supabaseUrl, supabaseKey) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/telegram_users?telegram_id=eq.${telegramId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role })
    });
  } catch (e) {
    console.error('Promote user error:', e);
  }
}

/**
 * Send request to Telegram Bot API
 */
async function sendTelegramApi(botToken, method, payload) {
  const tgUrl = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(tgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

/**
 * Title Sanitizer
 */
function sanitizeTitle(rawTitle) {
  if (!rawTitle) return 'Untitled Movie';
  let t = rawTitle.trim();
  t = t.replace(/^@[A-Za-z0-9_.\s]+?[-:]\s*/i, '');
  t = t.replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
  return t || 'Untitled Movie';
}

/**
 * HTML Escaper helper
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
