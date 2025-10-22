from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Get the absolute path to the HTML files
        base_path = os.path.abspath('all-in-one-downloader')
        index_path = f'file://{os.path.join(base_path, "index.html")}'
        signup_path = f'file://{os.path.join(base_path, "signup.html")}'

        # Verify the main page
        page.goto(index_path)
        page.screenshot(path='jules-scratch/verification/01_main_page_with_label.png')

        # Verify the signup page (to check the footer on a short page)
        page.goto(signup_path)
        page.screenshot(path='jules-scratch/verification/02_signup_page_footer.png')

        browser.close()

if __name__ == "__main__":
    run()
