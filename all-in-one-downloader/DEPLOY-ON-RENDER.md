# How to Deploy This Application on Render

This guide provides a complete, step-by-step walkthrough for deploying the JusDown application to [Render.com](https://render.com/). Following these instructions carefully will ensure your application is secure, functional, and ready to use.

---

### **Part 1: Forking the Repository**

Before you begin, you must have your own copy of the code in your GitHub account.

1.  **Fork the Repository:** If you haven't already, make sure you have a "fork" of the original project repository. This creates a personal copy of the code under your GitHub account that you can connect to Render.

---

### **Part 2: Setting Up the Application on Render**

This section will guide you through creating and configuring the web service on Render.

1.  **Create a New Service:**
    *   Log in to your Render dashboard.
    *   Click **New +** and select **Web Service**.
    *   Connect your GitHub account and select your forked repository.

2.  **Configure the Service Settings:**
    *   **Name:** Give your service a name (e.g., `jusdown`).
    *   **Root Directory:** **Leave this blank.**
    *   **Environment:** `Python 3`
    *   **Region:** Choose a region close to you.
    *   **Branch:** `main`
    *   **Build Command:** `sh all-in-one-downloader/build.sh`
    *   **Start Command:** `gunicorn "app:app" --chdir all-in-one-downloader`

3.  **Instance Type:** You can start with the **Free** plan.
4.  Click **Create Web Service**. The first deployment will likely fail because we haven't set up the environment variables yet. This is expected.

---

### **Part 3: Securely Configuring Credentials (Most Important Step)**

Your application requires several secret keys to function. Render allows you to store these securely as **Environment Variables** and **Secret Files**. **Never store your secrets directly in the code or in a public `.env` file.**

1.  **Navigate to Environment Settings:**
    *   In your Render dashboard, go to your newly created service.
    *   Click on the **Environment** tab.

2.  **Add Environment Variables:**
    *   Click **Add Environment Variable** for each of the following keys.
    *   Make sure you use the **exact names** as listed below. The values are the secrets you obtained from Razorpay and generated for Flask.

| Key Name | Value |
| :--- | :--- |
| `FLASK_SECRET_KEY` | *Your randomly generated Flask key* |
| `RAZORPAY_KEY_ID` | *Your Razorpay Key ID* |
| `RAZORPAY_KEY_SECRET`| *Your Razorpay Key Secret* |
| `RAZORPAY_WEBHOOK_SECRET` | *Your Razorpay Webhook Secret* |
| `PYTHON_VERSION` | `3.11.4` |

3.  **Add the Firebase Credentials as a Secret File:**
    *   This is the correct and secure way to handle the `firebase_cred.json` file.
    *   Scroll down to the **Secret Files** section.
    *   Click **Add Secret File**.
    *   **Filename:** Enter `firebase_cred.json`.
    *   **Contents:** Open your actual `firebase_cred.json` file on your computer, **copy the entire JSON content**, and paste it into this box.
    *   Click **Save Changes**.

4.  **Link the Secret File with an Environment Variable:**
    *   After adding the secret file, Render will provide a path for it (usually `/etc/secrets/firebase_cred.json`).
    *   Go back up to the **Environment Variables** section.
    *   Click **Add Environment Variable** one last time.
    *   **Key Name:** `FIREBASE_CREDENTIALS_PATH`
    *   **Value:** Paste the path that Render provided for your secret file (e.g., `/etc/secrets/firebase_cred.json`).

---

### **Part 4: Final Deployment**

1.  **Trigger a New Deploy:**
    *   After you have saved all the environment variables and the secret file, go to the **Events** tab for your service.
    *   Click **Deploy** -> **Clear build cache & deploy**. This ensures all your new settings are used.

2.  **Verify:**
    *   Once the deployment is complete, your application should be live and fully functional at the URL Render provides.
    *   Check the logs for any errors. If you followed all the steps, it should start successfully.

Your site is now deployed! Remember to update your **Firebase Authorized Domains** and **Razorpay Webhook URL** with your new live Render URL.
