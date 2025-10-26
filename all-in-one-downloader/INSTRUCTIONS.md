# Instructions for Running JusDown Locally

This guide will walk you through setting up and running the JusDown project on your Ubuntu machine using standard, platform-independent tools.

## Step 1: Install System Dependencies

First, you need to install the core tools required: `python`, `pip` for Python packages, and `ffmpeg` for video/audio processing.

Open your terminal and run this command:

```bash
sudo apt-get update && sudo apt-get install -y python3 python3-pip ffmpeg
```

## Step 2: Install Python Packages

Navigate to your project's `all-in-one-downloader` directory in the terminal. Then, install the required Python libraries from `requirements.txt`:

```bash
cd path/to/your/all-in-one-downloader
pip3 install -r requirements.txt
```

## Step 3: Configure Your Credentials (`.env` file)

This is the most important step for configuring the application.

1.  **Find `env.txt`**: In the `all-in-one-downloader` folder, you will find a file named `env.txt`.
2.  **Rename It**: Rename this file to `.env`. Be sure to include the dot `.` at the beginning. In the terminal, you can use this command:
    ```bash
    mv env.txt .env
    ```
3.  **Edit the File**: Open the new `.env` file in a text editor.
4.  **Fill in Your Secrets**:
    *   Replace the placeholder values for Razorpay with your actual **Test Keys** from the Razorpay dashboard.
    *   For `FIREBASE_CREDENTIALS_PATH`, replace the placeholder with the **full, absolute path** to your Firebase service account JSON file on your computer (e.g., `/home/your-username/Downloads/jusdown-firebase-key.json`).

## Step 4: Run the Web Server

You are now ready to run the application!

The `api/index.py` file contains your backend code. To run it, you will use `gunicorn`, the professional Python web server you installed in Step 2.

From inside the `all-in-one-downloader` directory, run this command:

```bash
gunicorn --chdir api "index:app" --bind 0.0.0.0:8000
```

**What this command does:**
*   `gunicorn`: Starts the web server.
*   `--chdir api`: Tells gunicorn to look inside the `api` directory.
*   `"index:app"`: Tells gunicorn to find the file `index.py` and use the Flask object named `app` inside it.
*   `--bind 0.0.0.0:8000`: Tells the server to listen on port 8000.

After running this, your backend API will be running.

## Step 5: Serve the Frontend (HTML/CSS/JS)

For local testing, you need a simple way to serve the `index.html` file. The easiest way is to use Python's built-in web server.

1.  **Open a NEW terminal window.** (Do not close the gunicorn terminal).
2.  Navigate to the `all-in-one-downloader` directory again in this new terminal.
3.  Run this command:
    ```bash
    python3 -m http.server
    ```
4.  Your terminal will show a message like `Serving HTTP on 0.0.0.0 port 8000`.

**You now have two servers running:**
*   The **backend API** (Gunicorn)
*   The **frontend files** (Python's simple server)

Now, you can open your web browser and go to `http://localhost:8000` to use your application.
