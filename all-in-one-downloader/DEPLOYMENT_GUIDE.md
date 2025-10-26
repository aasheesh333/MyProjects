# Final Deployment Guide for JusDown

This guide contains the corrected and simplified instructions to get your application fully working on Render.com.

## Part 1: Authorize Your Domain in Firebase

This is a **critical new step** to fix the Google Sign-in issue. You must tell Firebase to trust your new website URL.

1.  **Go to the Firebase Console**: [https://console.firebase.google.com/](https://console.firebase.google.com/)
2.  Select your project.
3.  In the left menu, go to **Authentication**.
4.  Click on the **Settings** tab.
5.  Select the **Authorized domains** section.
6.  Click **Add domain** and enter the domain name that Render gave you (e.g., `jusdown.onrender.com`).
7.  Click **Add**.

## Part 2: Deploying on Render.com

**1. Get Your Firebase Key**

*   If you don't have it already, go to your **Project settings** in Firebase, then the **Service accounts** tab, and click **Generate new private key**. A JSON file will be downloaded.

**2. Create the Web Service on Render**

*   On the Render Dashboard, click **New +** -> **Web Service**.
*   Connect your GitHub and select your project repository.

**3. Configure the Service**

Use these **updated and corrected** settings:

*   **Name**: `jusdown` (or any unique name).
*   **Root Directory**: `all-in-one-downloader` (Set this explicitly).
*   **Runtime**: **Python 3**.
*   **Build Command**: `bash build.sh` (This now runs our new script).
*   **Start Command**: `gunicorn "app:app"`

**4. Add Environment Variables & Secrets**

Scroll down to the **Environment** section and add the following:

| Type                | Key                           | Value / Instructions                                 |
| ------------------- | ----------------------------- | ---------------------------------------------------- |
| Environment Variable| `PYTHON_VERSION`              | `3.11.4`                                             |
| Environment Variable| `FLASK_SECRET_KEY`            | `2c0543ed04fd55de7ec72cfe93ea2f8926f0398a07b56790`     |
| Environment Variable| `RAZORPAY_KEY_ID`             | *Your actual Razorpay Test Key ID*                   |
| Environment Variable| `RAZORPAY_KEY_SECRET`         | *Your actual Razorpay Test Key Secret*               |
| Environment Variable| `RAZORPAY_WEBHOOK_SECRET`     | *Your actual Razorpay Webhook Secret*                |
| Secret File         | `FIREBASE_CREDENTIALS_PATH`   | `firebase_key.json` (This is the **Path** field)     |
|                     |                               | *Paste the **content** of your JSON file here*       |

**5. Create or Redeploy the Web Service**

*   If this is your first time, click **Create Web Service**.
*   If you are updating your existing service, go to your service's page, click **Manual Deploy**, and choose **Deploy latest commit**.

After the deployment finishes, your application should be fully functional, with all styles, downloads, and sign-in features working correctly.
