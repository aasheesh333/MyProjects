# Deployment Guide for JusDown

This guide contains everything you need to run your application for local testing and to deploy it to Render.com.

## Part 1: Local Testing on Your Ubuntu Machine

Follow these steps to run the application on your own computer.

**1. Install Dependencies**

Open your terminal and run this command to install `python`, `pip`, and `ffmpeg`:

```bash
sudo apt-get update && sudo apt-get install -y python3 python3-pip ffmpeg
```

**2. Install Python Packages**

Navigate to the `all-in-one-downloader` directory and install the required libraries:

```bash
cd path/to/your/all-in-one-downloader
pip3 install -r requirements.txt
```

**3. Configure Credentials**

*   Rename the `env.txt` file to `.env`.
*   Open the `.env` file and fill in your secrets for Razorpay and the full path to your Firebase key file.

**4. Run the Server**

From the `all-in-one-downloader` directory, run the server with `gunicorn`:

```bash
gunicorn "app:app"
```

This single command will start your server. It serves your website and your API. You can now open `http://localhost:8000` in your browser.

---

## Part 2: Deploying to Render.com

**1. Create a New Web Service**

*   On the Render Dashboard, click **New +** -> **Web Service**.
*   Connect your GitHub and select your project repository.

**2. Configure the Service**

Use these settings on the configuration page:

*   **Name**: `jusdown-testing` (or any unique name).
*   **Root Directory**: `all-in-one-downloader` (Set this explicitly).
*   **Runtime**: **Python 3**.
*   **Build Command**: `pip install -r requirements.txt`
*   **Start Command**: `gunicorn "app:app"`

**3. Add Environment Variables & Secrets**

Scroll down to the **Environment** section.

*   Click **Add Environment Variable** to add your Razorpay keys and other settings.
*   Click **Add Secret File** to add your Firebase credentials.

Here is the full list of what you need to add:

| Type                | Key                           | Example Value                                       |
| ------------------- | ----------------------------- | --------------------------------------------------- |
| Environment Variable| `PYTHON_VERSION`              | `3.11.4`                                            |
| Environment Variable| `FLASK_SECRET_KEY`            | `2c0543ed04fd55de7ec72cfe93ea2f8926f0398a07b56790`    |
| Environment Variable| `RAZORPAY_KEY_ID`             | *Your actual Razorpay Test Key ID*                  |
| Environment Variable| `RAZORPAY_KEY_SECRET`         | *Your actual Razorpay Test Key Secret*              |
| Environment Variable| `RAZORPAY_WEBHOOK_SECRET`     | *Your actual Razorpay Webhook Secret*               |
| Secret File         | `FIREBASE_CREDENTIALS_PATH`   | `firebase_key.json` (This is the **Path** field)    |
|                     |                               | *Paste the **content** of your JSON file here*      |


**4. Create the Web Service**

*   Click **Create Web Service**. Render will now deploy your application.
