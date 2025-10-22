import asyncio
from playwright.async_api import async_playwright
import pathlib

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Get the absolute path to the HTML files
        base_path = pathlib.Path(__file__).parent.parent.parent.resolve()

        await page.goto(f"file://{base_path}/all-in-one-downloader/index.html")
        await page.wait_for_load_state("domcontentloaded")

        # 1. Capture desktop view with new horizontal controls
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.screenshot(path="jules-scratch/verification/01_desktop_horizontal_layout.png")

        # 2. Capture mobile view with horizontal header
        await page.set_viewport_size({"width": 375, "height": 667})
        await page.screenshot(path="jules-scratch/verification/02_mobile_horizontal_header.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
