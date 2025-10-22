from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the locally running server
        page.goto("http://localhost:5001")

        # Paste a YouTube URL
        page.get_by_placeholder("https://example.com/video").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        # Click the convert button
        page.get_by_role("button", name="Convert").click()

        # Wait for navigation to the download page
        page.wait_for_url("**/download.html")

        # Expect to find a "Download Now" button
        download_button = page.get_by_role("link", name="Download Now")
        expect(download_button).to_be_visible()

        # Take a screenshot for verification
        page.screenshot(path='jules-scratch/verification/03_e2e_test_success.png')

        browser.close()

if __name__ == "__main__":
    run()
