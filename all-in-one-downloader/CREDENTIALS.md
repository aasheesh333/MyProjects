# How to Find Your Credentials

This guide explains how to find the secret keys and credentials required to run the application. You will need to create a file named `.env` in this `all-in-one-downloader` directory and copy the contents of `.env.example` into it. Then, fill in the values according to the instructions below.

---

### 1. `FLASK_SECRET_KEY`

-   **What it is:** A secret key used by Flask to secure user sessions. It should be a long, random string.
-   **Where to find it:** You need to generate this yourself. You can use the following command in your terminal to create a strong, random key:
    ```bash
    python3 -c 'import secrets; print(secrets.token_hex(16))'
    ```
-   **Example:** `FLASK_SECRET_KEY='your_generated_secret_key_here'`

---

### 2. `RAZORPAY_KEY_ID` & 3. `RAZORPAY_KEY_SECRET`

-   **What they are:** These are your API keys for interacting with the Razorpay payment gateway.
-   **Where to find them:**
    1.  Log in to your [Razorpay Dashboard](https://dashboard.razorpay.com/).
    2.  Navigate to **Settings** -> **API Keys**.
    3.  Click **Generate New Key** (or view an existing key).
    4.  Copy the **Key ID** and **Key Secret**.
-   **Example:**
    ```
    RAZORPAY_KEY_ID='rzp_test_123456789abcde'
    RAZORPAY_KEY_SECRET='your_razorpay_key_secret_here'
    ```

---

### 4. `RAZORPAY_WEBHOOK_SECRET`

-   **What it is:** A secret key used to verify that webhooks (notifications) are actually coming from Razorpay.
-   **Where to find it:**
    1.  In your [Razorpay Dashboard](https://dashboard.razorpay.com/), navigate to **Settings** -> **Webhooks**.
    2.  Click **Add New Webhook**.
    3.  Enter the URL where your app is hosted, followed by `/razorpay-webhook`. For local testing, you might use a service like `ngrok`.
    4.  In the **Secret** field, enter a secure, random string. **You create this secret yourself.**
    5.  Select the `subscription.charged` and `subscription.halted` events.
    6.  Save the webhook. The secret you created is the value you need.
-   **Example:** `RAZORPAY_WEBHOOK_SECRET='a_strong_secret_you_created'`

---

### 5. `FIREBASE_CREDENTIALS_PATH`

-   **What it is:** The filename of the JSON file containing your Firebase project's service account credentials. This allows the backend to securely communicate with Firebase for authentication and database operations.
-   **Where to find it:**
    1.  Go to the [Firebase Console](https://console.firebase.google.com/) and select your project.
    2.  Click the gear icon next to **Project Overview** and go to **Project settings**.
    3.  Go to the **Service accounts** tab.
    4.  Click **Generate new private key**. A JSON file will be downloaded.
    5.  **Rename** this file to something simple (e.g., `firebase-credentials.json`).
    6.  Place this file in the `all-in-one-downloader` directory.
    7.  The value for `FIREBASE_CREDENTIALS_PATH` is the filename you just chose.
-   **Example:** `FIREBASE_CREDENTIALS_PATH='firebase-credentials.json'`
