# How to Integrate Your DataImpulse Rotating Proxy

This guide will walk you through the steps to configure your DataImpulse rotating residential proxy with the JusDown application. Following these steps will route all download requests through the proxy service, allowing the application to handle a high volume of traffic without being blocked.

## Step 1: Find Your Proxy Credentials in DataImpulse

1.  **Log in to your DataImpulse Dashboard.**
2.  Navigate to the section for your **Rotating Residential Proxies**.
3.  You will need to find your **Proxy User**, **Proxy Password**, and the **Proxy Host/Address**.
4.  DataImpulse provides these in a simple format. Your goal is to combine them into a single URL.

## Step 2: Format Your Proxy URL

The application requires your proxy credentials to be in a single URL format. It should look like this:

`http://USERNAME:PASSWORD@HOST:PORT`

**Example:**
*   If your username is `di_user123`
*   Your password is `topsecretpass`
*   The host is `gw.dataimpulse.com`
*   The port is `8200`

Your final `PROXY_URL` would be:
`http://di_user123:topsecretpass@gw.dataimpulse.com:8200`

Make sure to replace the example credentials with your actual ones.

## Step 3: Add the Proxy URL to Render

1.  **Go to your JusDown service on Render.com.**
2.  In the navigation menu, click on the **"Environment"** tab.
3.  Scroll down to the **"Environment Variables"** section.
4.  Click the **"Add Environment Variable"** button.
5.  In the **"Key"** field, enter exactly: `PROXY_URL`
6.  In the **"Value"** field, paste your full proxy URL from Step 2.
7.  Click **"Save Changes"**.

![Render Environment Variables](https://i.imgur.com/your-image-url.png) *(Note: This is an example image. Your dashboard may look different.)*

## Step 4: Redeploy Your Application

After adding the environment variable, Render needs to restart your service to apply the new setting.

1.  Go to the top of your service's dashboard.
2.  Click the **"Manual Deploy"** button.
3.  Select **"Deploy latest commit"** from the dropdown.

Your application will restart, and once it's live, it will automatically start using the DataImpulse proxy for all download requests. The `YOUTUBE_COOKIES_PATH` (if you set it up) will be ignored, as the proxy is now the primary method.
