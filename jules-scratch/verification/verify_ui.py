from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 375, "height": 812})
        page.goto("http://127.0.0.1:5001")
        page.screenshot(path="jules-scratch/verification/main_page.png")

        instagram_button = page.locator('button[data-platform="instagram"]')
        instagram_button.click()

        page.screenshot(path="jules-scratch/verification/instagram_page.png")

        browser.close()

run()
