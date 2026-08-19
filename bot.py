import asyncio
import os
import sys
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

# Telegram Bot Credentials
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8503429880:AAHu1OPZdV-7vouvusISJvlu-kZ1PXvSttQ")

# Web App URL (LocalTunnel / Vercel / Cloudflare Pages URL)
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://many-tools-look.loca.lt")

bot = Bot(token=TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎬 Open SMD PRIME Mini App", 
                    web_app=WebAppInfo(url=WEB_APP_URL)
                )
            ]
        ]
    )
    
    welcome_text = (
        "👋 **Vanakkam! Welcome to SMD PRIME** 🍿\n\n"
        "Your ultra-fast streaming Mini App is ready!\n"
        "Click the button below to launch the Mini App and stream movies instantly in HD!"
    )
    
    await message.answer(
        welcome_text,
        reply_markup=keyboard,
        parse_mode="Markdown"
    )

async def main():
    print("======================================================================")
    print("  🤖 SMD PRIME TELEGRAM BOT IS RUNNING LIVE")
    print(f"  🔗 Connected Web App URL: {WEB_APP_URL}")
    print("======================================================================")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        print("\n🛑 Telegram Bot stopped.")
