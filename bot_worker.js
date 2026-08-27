/**
 * SMD PRIME — Cloudflare Worker Telegram Bot Webhook Backend
 * Ultra-lightweight, zero-dependency serverless Telegram Bot backend.
 * Handles /start welcome, /help guide, and dynamic Supabase movie lookups.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle Webhook Setup Helper Endpoint (GET /setup-webhook?url=https://worker-url)
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/setup-webhook') {
      const targetWebhook = url.searchParams.get('url') || `${url.origin}/webhook`;
      const botToken = env.TELEGRAM_BOT_TOKEN || '8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ';
      
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(targetWebhook)}`);
      const data = await tgRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Only process POST updates from Telegram
    if (request.method !== 'POST') {
      return new Response('SMD PRIME Bot Webhook Active', { status: 200 });
    }

    const botToken = env.TELEGRAM_BOT_TOKEN || '8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ';
    const webAppUrl = env.WEB_APP_URL || 'https://smd-prime.vercel.app';
    const supabaseUrl = env.SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = env.SUPABASE_ANON_KEY || 'placeholder-key';

    try {
      const update = await request.json();
      
      // Handle Message Updates
      if (update.message) {
        ctx.waitUntil(handleMessage(update.message, botToken, webAppUrl, supabaseUrl, supabaseKey));
      } 
      // Handle Callback Queries (Help buttons, etc.)
      else if (update.callback_query) {
        ctx.waitUntil(handleCallback(update.callback_query, botToken, webAppUrl));
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('Webhook error:', err);
      return new Response('OK', { status: 200 });
    }
  }
};

/**
 * Main Message Handler
 */
async function handleMessage(message, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const firstName = message.from?.first_name || 'Movie Enthusiast';

  if (!text) return;

  // Handler: /start
  if (text.startsWith('/start')) {
    const welcomeText = 
      `<b>👋 Vanakkam, ${escapeHtml(firstName)}! Welcome to SMD PRIME 🍿</b>\n\n` +
      `<b>Your Ultra-Fast Cloud Cinema Engine</b>\n` +
      `Stream high-definition movies directly in Telegram with zero buffering, ` +
      `multiple audio tracks, external player support (VLC / MX Player), and dynamic 4K quality.\n\n` +
      `<b>🚀 Quick Start Options:</b>\n` +
      `• Tap <b>'Launch SMD PRIME Mini App'</b> below to start streaming immediately.\n` +
      `• Or simply <b>type any movie title</b> in this chat (e.g., <i>Master</i>, <i>Jana Nayagan</i>, <i>Jurassic</i>) to search live cinema library!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎬 Launch SMD PRIME Mini App', web_app: { url: webAppUrl } }
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

  // Handler: /help
  if (text.startsWith('/help')) {
    await sendHelpCard(chatId, botToken, webAppUrl);
    return;
  }

  // Handler: Movie Text Search
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

  // Answer callback query to remove spinner on button
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
    `<b>🍿 SMD PRIME — User Guide & Help Center</b>\n\n` +
    `<b>1. How to Stream Movies:</b>\n` +
    `Tap the Mini App button to open the full cinema catalog, browse trending movies, ` +
    `and tap Play. The in-app video decoder supports 1080p, 4K, gesture controls, and subtitles.\n\n` +
    `<b>2. Movie Chat Lookup:</b>\n` +
    `Just send any movie name in this chat! The bot will query Supabase and generate interactive movie cards with direct play buttons.\n\n` +
    `<b>3. External Player Support:</b>\n` +
    `Inside the video player, tap <b>'EXT'</b> or open playback settings to stream directly in VLC or MX Player for maximum performance.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🍿 Launch SMD PRIME', web_app: { url: webAppUrl } }
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
 * Real-time Supabase Movie Lookup Handler
 */
async function handleMovieLookup(chatId, queryText, botToken, webAppUrl, supabaseUrl, supabaseKey) {
  if (queryText.length < 2) return;

  // Send typing chat action
  await sendTelegramApi(botToken, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing'
  });

  // Query Supabase REST API
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
    console.error('Supabase query error in worker:', err);
  }

  // Fallback if no movies found
  if (!movies || movies.length === 0) {
    const emptyText = 
      `<b>🔍 No movies found matching '${escapeHtml(queryText)}'</b>\n\n` +
      `Try searching with a shorter title or tap below to browse the complete SMD PRIME Cloud Cinema library!`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🍿 Open Movie Catalog', web_app: { url: webAppUrl } }
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

  // Send movie cards
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
          { text: `🎬 Stream ${title.substring(0, 20)} in App`, web_app: { url: movieAppUrl } }
        ],
        [
          { text: '🍿 Open Full Catalog', web_app: { url: webAppUrl } }
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
