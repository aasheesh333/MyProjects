from playwright.sync_api import sync_playwright, Page, expect

def run(page: Page):
    # 1. Arrange: Go to the application homepage.
    page.goto("http://127.0.0.1:5001/")

    # 2. Assert: Confirm the page title is correct.
    expect(page).to_have_title("JusDown - All in One Downloader")

    # 3. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/homepage.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        run(page)
        browser.close()

if __name__ == "__main__":
    main()
