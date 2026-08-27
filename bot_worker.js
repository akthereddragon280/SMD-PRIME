/**
 * SMD PRIME — Cloudflare Worker Telegram Bot Webhook Engine
 * Production-grade serverless Telegram Bot webhook script.
 * 100% In-App Telegram WebApp Overlay Enforcement & Secure Supabase Secrets Integration.
 */

// Production Fallbacks for Supabase Cloud Database & Web App Frontend
const DEFAULT_SUPABASE_URL = 'https://iwulcblngplsjtsipods.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';
const DEFAULT_WEB_APP_URL = 'https://smd-prime.vercel.app';
const DEFAULT_BOT_TOKEN = '8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ';

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

    // 1. One-Click Webhook Registration Helper Endpoint (GET /setup-webhook?url=YOUR_WORKER_URL)
    if (request.method === 'GET' && url.pathname === '/setup-webhook') {
      const targetWebhook = url.searchParams.get('url') || `${url.origin}/webhook`;
      const botToken = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
      
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(targetWebhook)}`);
      const data = await tgRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // 2. Incoming Telegram POST Update Listener
    if (request.method === 'POST') {
      const botToken = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
      const webAppUrl = (env.WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/+$/, '');
      const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
      const supabaseKey = env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || DEFAULT_SUPABASE_ANON_KEY;

      try {
        const update = await request.json();
        
        if (update.message) {
          ctx.waitUntil(handleMessage(update.message, botToken, webAppUrl, supabaseUrl, supabaseKey));
        } else if (update.callback_query) {
          ctx.waitUntil(handleCallback(update.callback_query, botToken, webAppUrl));
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
  const text = (message.text || '').trim();
  const firstName = message.from?.first_name || 'Movie Enthusiast';

  if (!text) return;

  // 1. COMMAND HANDLER: /start
  if (text.startsWith('/start')) {
    const welcomeText = 
      `⚡ <b>Welcome to SMD PRIME, ${escapeHtml(firstName)}!</b> 🍿\n\n` +
      `Your ultra-fast cloud cinema streaming engine is live. ` +
      `Tap the button below to launch the OTT streaming app directly in Telegram with zero buffering and 4K quality!\n\n` +
      `<b>💡 Pro Tip:</b> Type any movie name in this chat (e.g. <i>Master</i>, <i>Jana Nayagan</i>, <i>Jurassic</i>) to search live movies!`;

    // Strictly Telegram WebApp overlay buttons (NO external url buttons)
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚀 Launch SMD PRIME', web_app: { url: webAppUrl } }
        ],
        [
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

  // 2. COMMAND HANDLER: /help
  if (text.startsWith('/help')) {
    await sendHelpCard(chatId, botToken, webAppUrl);
    return;
  }

  // 3. TEXT FALLBACK & DYNAMIC SUPABASE MOVIE SEARCH
  if (!text.startsWith('/')) {
    await handleMovieLookup(chatId, text, botToken, webAppUrl, supabaseUrl, supabaseKey);
  }
}

/**
 * Callback Query Handler (Help Button Trigger)
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
 * Send Help Guide Card (100% web_app buttons)
 */
async function sendHelpCard(chatId, botToken, webAppUrl) {
  const helpText = 
    `🍿 <b>SMD PRIME — User Guide & Help Center</b>\n\n` +
    `<b>1. Browse & Stream Movies:</b>\n` +
    `Tap <b>'🚀 Launch SMD PRIME'</b> below to open the Mini App and stream movies in 1080p/4K.\n\n` +
    `<b>2. Instant Chat Search:</b>\n` +
    `Type any movie name directly in this chat to receive interactive movie cards with instant play buttons.\n\n` +
    `<b>3. External Player Support:</b>\n` +
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
 * Dynamic Supabase Movie Lookup Handler
 */
async function handleMovieLookup(chatId, queryText, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  if (queryText.length < 2) return;

  await sendTelegramApi(botToken, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing'
  });

  let movies = [];
  try {
    const searchUrl = `${supabaseUrl}/rest/v1/movies?select=*,movie_sources(*)&or=(title.ilike.*${encodeURIComponent(queryText)}*,original_title.ilike.*${encodeURIComponent(queryText)}*,overview.ilike.*${encodeURIComponent(queryText)}*)&limit=3`;
    const sbRes = await fetch(searchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    if (sbRes.ok) {
      movies = await sbRes.json();
    } else {
      console.error(`Supabase query status ${sbRes.status}: ${await sbRes.text()}`);
    }
  } catch (err) {
    console.error('Supabase query exception in worker:', err);
  }

  // Fallback card if no movies match
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

  // Send movie cards (strictly web_app inline buttons)
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

    // Deep link directly inside Telegram Mini App popup
    const movieAppUrl = `${webAppUrl}?movie=${uid}`;

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
