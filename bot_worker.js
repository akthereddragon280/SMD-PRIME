/**
 * SMD PRIME — Cloudflare Worker Telegram Bot Webhook Backend
 * Production-ready serverless Telegram Bot webhook script.
 * Handles /start, /help, text fallback, and dynamic Supabase movie lookups with CORS headers.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

export default {
  async fetch(request, env, ctx) {
    // 0. Handle CORS Preflight Options
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 1. Webhook Registration Endpoint (GET /setup-webhook?url=https://worker-domain)
    if (request.method === 'GET' && url.pathname === '/setup-webhook') {
      const targetWebhook = url.searchParams.get('url') || `${url.origin}/webhook`;
      const botToken = env.TELEGRAM_BOT_TOKEN || '8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ';
      
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(targetWebhook)}`);
      const data = await tgRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // 2. Webhook POST Listener
    if (request.method === 'POST') {
      const botToken = env.TELEGRAM_BOT_TOKEN || '8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ';
      const webAppUrl = env.WEB_APP_URL || 'https://smd-prime.vercel.app';
      const supabaseUrl = env.SUPABASE_URL || 'https://placeholder.supabase.co';
      const supabaseKey = env.SUPABASE_ANON_KEY || 'placeholder-key';

      try {
        const update = await request.json();
        
        if (update.message) {
          ctx.waitUntil(handleMessage(update.message, botToken, webAppUrl, supabaseUrl, supabaseKey));
        } else if (update.callback_query) {
          ctx.waitUntil(handleCallback(update.callback_query, botToken, webAppUrl));
        }

        return new Response('OK', { status: 200, headers: CORS_HEADERS });
      } catch (err) {
        console.error('Webhook payload error:', err);
        return new Response('OK', { status: 200, headers: CORS_HEADERS });
      }
    }

    return new Response('SMD PRIME Bot Webhook Engine Active', { status: 200, headers: CORS_HEADERS });
  }
};

/**
 * Main Webhook Message Handler
 */
async function handleMessage(message, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const firstName = message.from?.first_name || 'Movie Enthusiast';

  if (!text) return;

  // 1. Command Handler for /start
  if (text.startsWith('/start')) {
    const welcomeText = 
      `⚡ <b>Welcome to SMD PRIME, ${escapeHtml(firstName)}!</b> 🍿\n\n` +
      `Your ultra-fast cloud cinema streaming engine is live. ` +
      `Tap the button below to launch the OTT streaming app, browse the full library, ` +
      `and stream movies securely in Ultra HD 4K!\n\n` +
      `<b>💡 Pro Tip:</b> You can also type any movie name in this chat (e.g. <i>Master</i>, <i>Jana Nayagan</i>, <i>Jurassic</i>) to search live movies!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }
        ],
        [
          { text: '🌐 Open Web App', url: webAppUrl },
          { text: '⚡ Help & Guide', callback_data: 'help_info' }
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

  // 2. Command Handler for /help
  if (text.startsWith('/help')) {
    await sendHelpCard(chatId, botToken, webAppUrl);
    return;
  }

  // 3. Text Fallback & Dynamic Supabase Movie Search Handler
  if (!text.startsWith('/')) {
    await handleMovieLookup(chatId, text, botToken, webAppUrl, supabaseUrl, supabaseKey);
  }
}

/**
 * Callback Query Handler
 */
async function handleCallback(callbackQuery, botToken, webAppUrl) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data;

  await sendTelegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQuery.id
  });

  if (data === 'help_info' && chatId) {
    await sendHelpCard(chatId, botToken, webAppUrl);
  }
}

/**
 * Send Help Guide Card
 */
async function sendHelpCard(chatId, botToken, webAppUrl) {
  const helpText = 
    `🍿 <b>SMD PRIME — User Guide & Help Center</b>\n\n` +
    `<b>1. Browse & Stream Movies:</b>\n` +
    `Tap <b>'🚀 Launch SMD PRIME'</b> below to open the Mini App. You can stream movies in 1080p / 4K with multiple audio languages and subtitles.\n\n` +
    `<b>2. Instant Chat Search:</b>\n` +
    `Type any movie name directly in this chat! The bot will query our cloud database and return interactive movie cards with instant play buttons.\n\n` +
    `<b>3. External Player Handoff:</b>\n` +
    `Inside the video player, tap <b>'EXT'</b> to stream seamlessly in external players like VLC or MX Player.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }
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
 * Text Fallback & Supabase Movie Search Handler
 */
async function handleMovieLookup(chatId, queryText, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  if (queryText.length < 2) return;

  await sendTelegramApi(botToken, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing'
  });

  let movies = [];
  try {
    const searchUrl = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/movies?select=*,movie_sources(*)&or=(title.ilike.*${encodeURIComponent(queryText)}*,original_title.ilike.*${encodeURIComponent(queryText)}*,overview.ilike.*${encodeURIComponent(queryText)}*)&limit=3`;
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
    console.error('Supabase query error:', err);
  }

  if (!movies || movies.length === 0) {
    const emptyText = 
      `🔍 <b>No movies found matching '${escapeHtml(queryText)}'</b>\n\n` +
      `Tap below to launch the SMD PRIME Mini App and search our full cloud cinema catalog!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }
        ]
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

  for (const movie of movies.slice(0, 3)) {
    const uid = movie.uid || movie.id || 'master_2021';
    const title = sanitizeTitle(movie.title);
    const origTitle = sanitizeTitle(movie.original_title || title);
    const year = movie.release_year || '2026';
    const rating = movie.rating !== null && movie.rating !== undefined ? String(movie.rating) : '7.5';
    const duration = movie.duration || '2h 15m';
    const overview = movie.overview || 'High quality cinema stream loaded live from SMD Prime Cloud Cinema Library.';
    const poster = movie.poster_url;

    const sources = movie.movie_sources || [];
    const qualities = sources.map(s => s.quality).filter(Boolean);
    const qualityStr = qualities.length > 0 ? qualities.join(', ') : '1080p Ultra HD';

    const movieAppUrl = `${webAppUrl.replace(/\/+$/, '')}?movie=${uid}`;

    const cardKeyboard = {
      inline_keyboard: [
        [
          { text: `🎬 Stream ${title.substring(0, 20)}`, web_app: { url: movieAppUrl } }
        ],
        [
          { text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }
        ]
      ]
    };

    const cardText = 
      `<b>🎬 ${escapeHtml(title)} (${year})</b>\n` +
      `<i>${escapeHtml(origTitle)}</i>\n\n` +
      `⭐ <b>Rating:</b> ${rating} / 10 | 🎭 <b>Genre:</b> Action\n` +
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
}

async function sendTelegramApi(botToken, method, payload) {
  const tgUrl = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(tgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function sanitizeTitle(rawTitle) {
  if (!rawTitle) return 'Untitled Movie';
  let t = rawTitle.trim();
  t = t.replace(/^@[A-Za-z0-9_.\s]+?[-:]\s*/i, '');
  t = t.replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
  return t || 'Untitled Movie';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
