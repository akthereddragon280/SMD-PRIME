import asyncio
import os
import sys
import logging
import httpx
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Environment Variables & Configuration
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://smd-prime.vercel.app")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://placeholder.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "placeholder-key")

bot = Bot(token=TOKEN)
dp = Dispatcher()

def sanitize_title(title_str: str) -> str:
    """Strips telegram/torrent channel tag prefixes from titles."""
    if not title_str:
        return "Untitled Movie"
    t = title_str.strip()
    t = t.replace('@', '').replace('_', ' ').replace('.', ' ')
    return ' '.join(t.split())

async def search_supabase_movies(query: str):
    """Query Supabase movies table with joined movie_sources for text query."""
    if not SUPABASE_URL or "placeholder" in SUPABASE_URL:
        logging.warning("Supabase URL not configured or placeholder.")
        return []

    clean_query = query.strip()
    if not clean_query:
        return []

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/movies"
    params = {
        "select": "*,movie_sources(*)",
        "or": f"(title.ilike.*{clean_query}*,original_title.ilike.*{clean_query}*,overview.ilike.*{clean_query}*)",
        "limit": "3"
    }
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else []
            else:
                logging.error(f"Supabase HTTP Error {resp.status_code}: {resp.text}")
                return []
    except Exception as e:
        logging.error(f"Supabase fetch exception: {e}")
        return []

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    """1. Command Handler for /start with Web App Launch Button."""
    user = message.from_user
    first_name = user.first_name if user else "Movie Enthusiast"

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Launch SMD PRIME",
                    web_app=WebAppInfo(url=WEB_APP_URL)
                )
            ],
            [
                InlineKeyboardButton(
                    text="🌐 Open Web App in Browser",
                    url=WEB_APP_URL
                ),
                InlineKeyboardButton(
                    text="⚡ Help & Guide",
                    callback_data="help_info"
                )
            ]
        ]
    )

    welcome_text = (
        f"⚡ <b>Welcome to SMD PRIME, {first_name}!</b> 🍿\n\n"
        "Your ultra-fast cloud cinema streaming engine is live. "
        "Tap the button below to launch the OTT streaming app, browse the full library, "
        "and stream movies securely in Ultra HD 4K!\n\n"
        "<b>💡 Pro Tip:</b> You can also type any movie name in this chat (e.g. <i>Master</i>, <i>Jana Nayagan</i>, <i>Jurassic</i>) to search live movies!"
    )

    await message.answer(
        welcome_text,
        reply_markup=keyboard,
        parse_mode="HTML"
    )

@dp.message(Command("help"))
@dp.callback_query(F.data == "help_info")
async def cmd_help(event: types.Message | types.CallbackQuery):
    """2. Command Handler for /help."""
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Launch SMD PRIME",
                    web_app=WebAppInfo(url=WEB_APP_URL)
                )
            ]
        ]
    )

    help_text = (
        "🍿 <b>SMD PRIME — User Guide & Help Center</b>\n\n"
        "<b>1. Browse & Stream Movies:</b>\n"
        "Tap <b>'🚀 Launch SMD PRIME'</b> below to open the Mini App. You can stream movies in 1080p / 4K with multiple audio languages and subtitles.\n\n"
        "<b>2. Instant Chat Search:</b>\n"
        "Type any movie name directly in this chat! The bot will query our cloud database and return interactive movie cards with instant play buttons.\n\n"
        "<b>3. External Player Handoff:</b>\n"
        "Inside the video player, tap <b>'EXT'</b> to stream seamlessly in external players like VLC or MX Player."
    )

    if isinstance(event, types.CallbackQuery):
        await event.answer()
        await event.message.answer(help_text, reply_markup=keyboard, parse_mode="HTML")
    else:
        await event.answer(help_text, reply_markup=keyboard, parse_mode="HTML")

@dp.message(F.text & ~F.text.startswith("/"))
async def handle_text_fallback(message: types.Message):
    """3. Text Fallback & Dynamic Movie Search Handler."""
    query = message.text.strip()
    if len(query) < 2:
        return

    await bot.send_chat_action(chat_id=message.chat.id, action="typing")
    movies = await search_supabase_movies(query)

    if not movies or len(movies) == 0:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🚀 Launch SMD PRIME",
                        web_app=WebAppInfo(url=WEB_APP_URL)
                    )
                ]
            ]
        )
        await message.answer(
            f"🔍 <b>No movies found matching '{query}'</b>\n\n"
            "Tap below to launch the SMD PRIME Mini App and search our full cloud cinema catalog!",
            reply_markup=keyboard,
            parse_mode="HTML"
        )
        return

    for movie in movies[:3]:
        uid = movie.get("uid") or movie.get("id") or "master_2021"
        title = sanitize_title(movie.get("title") or "Untitled Movie")
        orig_title = sanitize_title(movie.get("original_title") or title)
        year = movie.get("release_year") or "2026"
        rating = movie.get("rating") or "7.5"
        overview = movie.get("overview") or "High quality cinema stream loaded live from SMD Prime Cloud Cinema Library."
        poster = movie.get("poster_url")
        duration = movie.get("duration") or "2h 15m"

        sources = movie.get("movie_sources") or []
        qualities = [s.get("quality") for s in sources if s.get("quality")]
        quality_str = ", ".join(qualities) if qualities else "1080p Ultra HD"

        movie_app_url = f"{WEB_APP_URL.rstrip('/')}?movie={uid}"

        card_keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=f"🎬 Stream {title[:20]}",
                        web_app=WebAppInfo(url=movie_app_url)
                    )
                ],
                [
                    InlineKeyboardButton(
                        text="🚀 Launch SMD PRIME",
                        web_app=WebAppInfo(url=WEB_APP_URL)
                    )
                ]
            ]
        )

        card_text = (
            f"<b>🎬 {title} ({year})</b>\n"
            f"<i>{orig_title}</i>\n\n"
            f"⭐ <b>Rating:</b> {rating} / 10 | 🎭 <b>Genre:</b> Action\n"
            f"⏱️ <b>Duration:</b> {duration} | 💿 <b>Quality:</b> {quality_str}\n\n"
            f"📖 <b>Overview:</b> {overview[:180]}..."
        )

        try:
            if poster and poster.startswith("http"):
                await message.answer_photo(
                    photo=poster,
                    caption=card_text,
                    reply_markup=card_keyboard,
                    parse_mode="HTML"
                )
            else:
                await message.answer(
                    card_text,
                    reply_markup=card_keyboard,
                    parse_mode="HTML"
                )
        except Exception:
            await message.answer(
                card_text,
                reply_markup=card_keyboard,
                parse_mode="HTML"
            )

async def main():
    print("======================================================================")
    print("  🤖 SMD PRIME TELEGRAM BOT IS RUNNING LIVE")
    print(f"  🔗 Connected Web App URL: {WEB_APP_URL}")
    print(f"  ⚡ Supabase Backend URL: {SUPABASE_URL}")
    print("======================================================================")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        print("\n🛑 Telegram Bot stopped.")
